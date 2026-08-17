mod embedded;
mod game;
mod server;
mod storage;

use game::AppSettings;
use std::collections::HashMap;

use game::*;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tauri::Manager;

struct AppStateWrapper(Arc<AppState>);

// ─── Tauri Commands ───

#[tauri::command]
fn get_quizzes() -> Vec<Quiz> {
    storage::load_quizzes()
}

#[tauri::command]
fn create_quiz(title: String, description: String) -> Quiz {
    let quiz = Quiz {
        id: storage::generate_id(),
        title,
        description,
        questions: Vec::new(),
        created_at: format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()),
        tags: Vec::new(),
        total_time_seconds: 0,
    };
    storage::save_quiz(&quiz).ok();
    quiz
}

#[tauri::command]
fn save_quiz(quiz: Quiz) -> Result<(), String> {
    storage::save_quiz(&quiz)
}

#[tauri::command]
fn get_quiz(id: String) -> Option<Quiz> {
    storage::get_quiz(&id)
}

#[tauri::command]
fn delete_quiz(id: String) -> Result<(), String> {
    storage::delete_quiz(&id)
}

#[tauri::command]
async fn start_game(
    quiz_id: String,
    mode: String,
    advance: String,
    state: tauri::State<'_, AppStateWrapper>,
) -> Result<GameSession, String> {
    let quiz = storage::get_quiz(&quiz_id)
        .ok_or_else(|| "Квиз не найден".to_string())?;

    let game_mode = match mode.as_str() {
        "test" => GameMode::Test,
        "live" => GameMode::LiveQuiz,
        _ => return Err("Неверный режим".to_string()),
    };

    let advance_mode = match advance.as_str() {
        "auto" => AdvanceMode::Auto,
        "manual" => AdvanceMode::Manual,
        _ => AdvanceMode::Auto,
    };

    let pin = format!("{:06}", rand::random::<u32>() % 1000000);

    let session = GameSession {
        pin: pin.clone(),
        quiz,
        status: GameStatus::Lobby,
        mode: game_mode,
        advance: advance_mode,
        current_question_index: 0,
        players: Vec::new(),
        answers: Vec::new(),
        player_progress: std::collections::HashMap::new(),
        question_start_time: 0,
        server_port: 0,
    };

    state.0.sessions.write().await.insert(pin.clone(), session.clone());
    state.0.ws_senders.write().await.insert(pin.clone(), Vec::new());
    state.0.host_senders.write().await.insert(pin.clone(), Vec::new());
    state.0.ws_player_map.write().await.insert(pin.clone(), HashMap::new());

    storage::save_active_session(&session).ok();

    Ok(session)
}

#[tauri::command]
async fn get_game_state(
    pin: String,
    state: tauri::State<'_, AppStateWrapper>,
) -> Result<Option<GameSession>, String> {
    Ok(state.0.sessions.read().await.get(&pin).cloned())
}

#[tauri::command]
async fn get_server_info(
    state: tauri::State<'_, AppStateWrapper>,
) -> Result<ServerInfoResult, String> {
    let ip = local_ip_address::local_ip()
        .map_err(|e| format!("Не удалось определить IP: {}", e))?
        .to_string();

    let port = state.0.server_port.read().await.clone();
    let local_url = format!("http://{}:{}/player", ip, port);

    Ok(ServerInfoResult { ip, port, local_url })
}

#[derive(serde::Serialize)]
pub struct ServerInfoResult {
    pub ip: String,
    pub port: u16,
    pub local_url: String,
}

#[tauri::command]
async fn check_active_sessions() -> Vec<GameSession> {
    storage::load_active_sessions()
}

#[tauri::command]
fn clear_active_session(pin: String) -> Result<(), String> {
    storage::delete_active_session(&pin)
}

#[tauri::command]
fn get_app_info() -> serde_json::Value {
    let version = env!("CARGO_PKG_VERSION");
    let channel = if version.contains("dev") { "dev" } else { "stable" };
    serde_json::json!({ "version": version, "channel": channel })
}

#[tauri::command]
fn get_settings() -> AppSettings {
    storage::load_settings()
}

#[tauri::command]
fn save_settings(settings: AppSettings) -> Result<(), String> {
    storage::save_settings(&settings)
}

#[tauri::command]
async fn broadcast_style(style: String, dark: bool, state: tauri::State<'_, AppStateWrapper>) -> Result<(), String> {
    let msg = serde_json::to_string(&game::ServerMessage::StyleUpdate { style, dark }).map_err(|e| e.to_string())?;
    let pins: Vec<String> = state.0.ws_senders.read().await.keys().cloned().collect();
    for pin in pins {
        if let Some(senders) = state.0.ws_senders.read().await.get(&pin) {
            for tx in senders {
                let _ = tx.send(msg.clone());
            }
        }
    }
    Ok(())
}

#[tauri::command]
async fn export_results(pin: String, state: tauri::State<'_, AppStateWrapper>) -> Result<String, String> {
    let (players, title, mode_label) = {
        let sessions = state.0.sessions.read().await;
        let session = sessions.get(&pin).ok_or("Сессия не найдена".to_string())?;
        let mut players = session.players.clone();
        players.sort_by(|a, b| b.total_score.cmp(&a.total_score));
        let title = session.quiz.title.clone();
        let mode_label = match session.mode {
            game::GameMode::Test => "Проверочная работа",
            game::GameMode::LiveQuiz => "Викторина",
        }.to_string();
        (players, title, mode_label)
    };

    let desktop = std::env::var("USERPROFILE")
        .map_err(|_| "Не удалось определить папку пользователя".to_string())?;
    let path = format!("{}\\Desktop\\QuizKit_{}_{}.csv", desktop, title.replace('"', ""), pin);

    let mut csv = String::from("\u{FEFF}"); // UTF-8 BOM for Excel
    csv.push_str(&format!("QuizKit - {}\nРежим: {}\n\n", title, mode_label));
    csv.push_str("Место;Никнейм;Баллы\n");
    for (i, p) in players.iter().enumerate() {
        csv.push_str(&format!("{};{};{}\n", i + 1, p.nickname, p.total_score));
    }

    std::fs::write(&path, &csv).map_err(|e| format!("Ошибка сохранения: {}", e))?;
    Ok(path)
}

#[tauri::command]
fn download_app(app: String, app_handle: tauri::AppHandle) -> Result<String, String> {
    let exe_name = format!("{}.exe", app);

    // Try resource dir first (release mode), fallback to source tree (dev mode)
    let source_path = if let Ok(dir) = app_handle.path().resource_dir() {
        dir.join("assets/apps").join(&exe_name)
    } else {
        std::path::Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("../assets/apps")
            .join(&exe_name)
    };

    let downloads = std::env::var("USERPROFILE")
        .map_err(|_| "USERPROFILE not set".to_string())?;
    let dest = std::path::Path::new(&downloads).join("Downloads").join(&exe_name);

    std::fs::copy(&source_path, &dest)
        .map_err(|e| format!("Ошибка копирования: {} (искал {})", e, source_path.display()))?;

    Ok(dest.to_string_lossy().to_string())
}

#[tauri::command]
fn relaunch_app(app: tauri::AppHandle) {
    app.restart();
}

// ─── App Entry ───

pub fn run() {
    let app_state = Arc::new(AppState::new());

    let builder = tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .manage(AppStateWrapper(app_state.clone()))
        .invoke_handler(tauri::generate_handler![
            get_quizzes,
            create_quiz,
            save_quiz,
            get_quiz,
            delete_quiz,
            start_game,
            get_game_state,
            get_server_info,
            get_settings,
            save_settings,
            export_results,
            check_active_sessions,
            clear_active_session,
            broadcast_style,
            get_app_info,
            download_app,
            relaunch_app,
        ]);

    #[cfg(desktop)]
    let builder = builder.setup(move |_app| {
        let state_clone = app_state.clone();

        // Load persisted sessions into memory
        let state = state_clone.clone();
        tauri::async_runtime::spawn(async move {
            let saved = storage::load_active_sessions();
            let mut sessions = state.sessions.write().await;
            for session in saved {
                let pin = session.pin.clone();
                sessions.insert(pin.clone(), session);
                state.ws_senders.write().await.insert(pin.clone(), Vec::new());
                state.host_senders.write().await.insert(pin.clone(), Vec::new());
                state.ws_player_map.write().await.insert(pin.clone(), HashMap::new());
            }
        });

        tauri::async_runtime::spawn(async move {
            server::start_server(state_clone, 9876).await;
        });
        Ok(())
    });

    builder.run(tauri::generate_context!())
        .expect("error while running tauri application");
}
