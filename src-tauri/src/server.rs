use crate::game::*;
use crate::storage;
use axum::{
    extract::ws::{Message, WebSocket, WebSocketUpgrade},
    extract::State,
    response::IntoResponse,
    routing::get,
    Router,
};
use futures_util::{SinkExt, StreamExt};
use std::net::SocketAddr;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::mpsc;
use tower_http::cors::CorsLayer;

async fn persist_session(state: &Arc<AppState>, pin: &str) {
    let session = {
        let sessions = state.sessions.read().await;
        sessions.get(pin).cloned()
    };
    if let Some(session) = session {
        let _ = tokio::task::spawn_blocking(move || {
            storage::save_active_session(&session).ok();
        }).await;
    }
}

pub async fn start_server(state: Arc<AppState>, preferred_port: u16) {
    let app = Router::new()
        .route("/ws", get(ws_handler))
        .route("/player", get(player_page))
        .route("/", get(player_page))
        .layer(CorsLayer::permissive())
        .with_state(state.clone());

    // Try sequential ports, fallback to OS-assigned
    let actual_port;
    let listener = 'found: loop {
        for port in preferred_port..=preferred_port + 200 {
            let addr = SocketAddr::from(([0, 0, 0, 0], port));
            if let Ok(l) = tokio::net::TcpListener::bind(addr).await {
                actual_port = l.local_addr().unwrap().port();
                break 'found l;
            }
        }
        let addr = SocketAddr::from(([0, 0, 0, 0], 0));
        let l = tokio::net::TcpListener::bind(addr).await.unwrap();
        actual_port = l.local_addr().unwrap().port();
        break 'found l;
    };

    *state.server_port.write().await = actual_port;

    tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            eprintln!("[ИльЯкласс] Ошибка сервера: {}", e);
        }
    });
}

async fn player_page() -> impl IntoResponse {
    axum::response::Html(crate::embedded::PLAYER_HTML)
}

async fn ws_handler(
    ws: WebSocketUpgrade,
    State(state): State<Arc<AppState>>,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: Arc<AppState>) {
    let (mut sender, mut receiver) = socket.split();
    let (tx, mut rx) = mpsc::unbounded_channel::<String>();

    let mut player_id = String::new();
    let mut current_pin = String::new();

    let send_task = tokio::spawn(async move {
        while let Some(msg) = rx.recv().await {
            if sender.send(Message::Text(msg.into())).await.is_err() {
                break;
            }
        }
    });

    while let Some(Ok(msg)) = receiver.next().await {
        if let Message::Text(text) = msg {
            if let Ok(client_msg) = serde_json::from_str::<ClientMessage>(&text) {
                match client_msg {
                    ClientMessage::RegisterHost { pin } => {
                        current_pin = pin.clone();
                        let mut host_senders = state.host_senders.write().await;
                        host_senders.entry(pin.clone()).or_default().push(tx.clone());
                    }

                    ClientMessage::Join { pin, nickname } => {
                        let sessions = state.sessions.read().await;
                        if let Some(session) = sessions.get(&pin) {
                            if session.status != GameStatus::Lobby {
                                let _ = tx.send(serde_json::to_string(&ServerMessage::LobbyError {
                                    error: "Игра уже началась".to_string(),
                                }).unwrap());
                                continue;
                            }
                            let p_id = format!("player-{}", uuid::Uuid::new_v4());
                            player_id = p_id.clone();
                            current_pin = pin.clone();

                            let player = Player {
                                id: p_id.clone(),
                                nickname: nickname.clone(),
                                total_score: 0,
                                streak: 0,
                                joined_at: format!("{}", SystemTime::now().duration_since(UNIX_EPOCH).unwrap().as_millis()),
                            };

                            let sender_idx = {
                                let mut senders = state.ws_senders.write().await;
                                let sender_list = senders.entry(pin.clone()).or_default();
                                let idx = sender_list.len();
                                sender_list.push(tx.clone());
                                idx
                            };
                            {
                                let mut player_map = state.ws_player_map.write().await;
                                player_map.entry(pin.clone()).or_default().insert(p_id.clone(), sender_idx);
                            }

                            drop(sessions);
                            {
                                let mut sessions = state.sessions.write().await;
                                if let Some(session) = sessions.get_mut(&pin) {
                                    session.players.push(player.clone());

                                    let join_msg = serde_json::to_string(&ServerMessage::LobbyJoined {
                                        player_id: p_id.clone(),
                                        nickname: nickname.clone(),
                                        players: session.players.clone(),
                                    }).unwrap();
                                    let _ = tx.send(join_msg);

                                    let host_msg = serde_json::to_string(&ServerMessage::PlayerJoined {
                                        player,
                                    }).unwrap();
                                    if let Some(host_senders) = state.host_senders.read().await.get(&pin) {
                                        for htx in host_senders {
                                            let _ = htx.send(host_msg.clone());
                                        }
                                    }
                                }
                            }
                        } else {
                            let _ = tx.send(serde_json::to_string(&ServerMessage::LobbyError {
                                error: "Игра не найдена. Проверьте PIN".to_string(),
                            }).unwrap());
                        }
                        persist_session(&state, &pin).await;
                    }

                    ClientMessage::StartGame { pin } => {
                        current_pin = pin.clone();
                        let (game_mode, advance_mode) = {
                            let mut sessions = state.sessions.write().await;
                            if let Some(session) = sessions.get_mut(&pin) {
                                session.status = GameStatus::Active;
                                session.current_question_index = 0;
                                session.answers.clear();
                                if session.mode == GameMode::Test {
                                    for p in &session.players {
                                        session.player_progress.insert(p.id.clone(), 0);
                                    }
                                }
                                (session.mode.clone(), session.advance.clone())
                            } else { continue }
                        };
                        persist_session(&state, &pin).await;

                        let gs = serde_json::to_string(&ServerMessage::GameStarting {
                            countdown: 3,
                        }).unwrap();
                        for stx in state.ws_senders.read().await.get(&pin).unwrap_or(&vec![]) {
                            let _ = stx.send(gs.clone());
                        }
                        if let Some(host_senders) = state.host_senders.read().await.get(&pin) {
                            for htx in host_senders {
                                let _ = htx.send(gs.clone());
                            }
                        }

                            match game_mode {
                                GameMode::Test => {
                                    broadcast_test_start(&state, &pin).await;
                                }
                                GameMode::LiveQuiz => {
                                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                                    broadcast_question(&state, &pin, 0).await;

                                    if advance_mode == AdvanceMode::Auto {
                                        let state_clone = state.clone();
                                        let pin_clone = pin.clone();
                                        let total = {
                                            let sessions = state.sessions.read().await;
                                            sessions.get(&pin).map(|s| s.quiz.questions.len()).unwrap_or(0)
                                        };
                                        tokio::spawn(async move {
                                            for q_idx in 0..total {
                                                let duration = {
                                                    let sessions = state_clone.sessions.read().await;
                                                    sessions.get(&pin_clone)
                                                        .and_then(|s| s.quiz.questions.get(q_idx))
                                                        .map(|q| q.time_seconds)
                                                        .unwrap_or(10)
                                                };
                                                tokio::time::sleep(tokio::time::Duration::from_secs(duration as u64)).await;

                                                if q_idx + 1 < total {
                                                    show_round_results_with_next(&state_clone, &pin_clone, 3).await;
                                                    tokio::time::sleep(tokio::time::Duration::from_secs(3)).await;
                                                    let mut sessions = state_clone.sessions.write().await;
                                                    if let Some(session) = sessions.get_mut(&pin_clone) {
                                                        session.current_question_index = q_idx + 1;
                                                        session.answers.clear();
                                                    }
                                                    drop(sessions);
                                                    persist_session(&state_clone, &pin_clone).await;
                                                    broadcast_question(&state_clone, &pin_clone, q_idx + 1).await;
                                                } else {
                                                    show_round_results_with_next(&state_clone, &pin_clone, 4).await;
                                                    tokio::time::sleep(tokio::time::Duration::from_secs(4)).await;
                                                    show_final_results(&state_clone, &pin_clone).await;
                                                }
                                            }
                                        });
                                    }
                                }
                            }
                    }

                    ClientMessage::SubmitAnswer { pin, answer_index } => {
                        if player_id.is_empty() { continue; }

                        let mode = {
                            let sessions = state.sessions.read().await;
                            sessions.get(&pin).map(|s| s.mode.clone())
                        };

                        match mode {
                            Some(GameMode::Test) => {
                                let mut sessions = state.sessions.write().await;
                                if let Some(session) = sessions.get_mut(&pin) {
                                    let q_idx = *session.player_progress.get(&player_id).unwrap_or(&0);
                                    if let Some(question) = session.quiz.questions.get(q_idx) {
                                        if session.answers.iter().any(|a| a.player_id == player_id && a.question_index == q_idx) {
                                            continue;
                                        }
                                        let correct_idx = question.answers.iter()
                                            .position(|a| a.is_correct).unwrap_or(0);
                                        let is_correct = answer_index == correct_idx;
                                        let points = if is_correct { question.points } else { 0 };
                                        if let Some(player) = session.players.iter_mut().find(|p| p.id == player_id) {
                                            player.total_score += points;
                                        }
                                        session.answers.push(PlayerAnswer {
                                            player_id: player_id.clone(),
                                            question_index: q_idx,
                                            answer_index,
                                            is_correct,
                                            time_ms: 0,
                                            points_earned: points,
                                        });
                                        let player_score = session.players.iter()
                                            .find(|p| p.id == player_id).map(|p| p.total_score).unwrap_or(0);
                                        let _ = tx.send(serde_json::to_string(&ServerMessage::AnswerResult {
                                            correct: is_correct, points, score: player_score, correct_index: correct_idx, show_next: true,
                                        }).unwrap());
                                    }
                                }
                                drop(sessions);
                                persist_session(&state, &pin).await;
                                send_progress_to_host(&state, &pin).await;
                            }
                            Some(GameMode::LiveQuiz) => {
                                let (answer_msg, all_answered, advance) = {
                                    let mut sessions = state.sessions.write().await;
                                    if let Some(session) = sessions.get_mut(&pin) {
                                        let q_idx = session.current_question_index;
                                        if let Some(question) = session.quiz.questions.get(q_idx) {
                                            if session.answers.iter().any(|a| a.player_id == player_id && a.question_index == q_idx) {
                                                (None, false, session.advance.clone())
                                            } else {
                                                let correct_idx = question.answers.iter()
                                                    .position(|a| a.is_correct).unwrap_or(0);
                                                let is_correct = answer_index == correct_idx;
                                                let points = if is_correct { question.points } else { 0 };
                                                if let Some(player) = session.players.iter_mut().find(|p| p.id == player_id) {
                                                    player.total_score += points;
                                                }
                                                session.answers.push(PlayerAnswer {
                                                    player_id: player_id.clone(),
                                                    question_index: q_idx,
                                                    answer_index,
                                                    is_correct,
                                                    time_ms: 0,
                                                    points_earned: points,
                                                });
                                                let player_score = session.players.iter()
                                                    .find(|p| p.id == player_id).map(|p| p.total_score).unwrap_or(0);
                                                let msg = serde_json::to_string(&ServerMessage::AnswerResult {
                                                    correct: is_correct, points, score: player_score, correct_index: correct_idx, show_next: false,
                                                }).unwrap();
                                                let answered_count = session.answers.iter().filter(|a| a.question_index == q_idx).count();
                                                let all_done = answered_count >= session.players.len();
                                                let host_msg = serde_json::to_string(&ServerMessage::HostUpdate {
                                                    players: session.players.clone(),
                                                    answered: answered_count,
                                                    total_players: session.players.len(),
                                                }).unwrap();
                                                if let Some(host_senders) = state.host_senders.read().await.get(&pin) {
                                                    for htx in host_senders {
                                                        let _ = htx.send(host_msg.clone());
                                                    }
                                                }
                                                (Some(msg), all_done, session.advance.clone())
                                            }
                                        } else { (None, false, AdvanceMode::Auto) }
                                    } else { (None, false, AdvanceMode::Auto) }
                                };
                                persist_session(&state, &pin).await;
                                if let Some(m) = answer_msg {
                                    let _ = tx.send(m);
                                }
                                if all_answered && advance == AdvanceMode::Auto {
                                    let state_clone = state.clone();
                                    let pin_clone = pin.clone();
                                    tokio::spawn(async move {
                                        tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
                                        show_round_results(&state_clone, &pin_clone).await;
                                    });
                                }
                            }
                            None => {}
                        }
                    }

                    ClientMessage::NextQuestion { pin } => {
                        let mode = {
                            let sessions = state.sessions.read().await;
                            sessions.get(&pin).map(|s| s.mode.clone())
                        };

                        match mode {
                            Some(GameMode::Test) => {
                                // Test mode no longer uses per-question NextQuestion
                            }
                            Some(GameMode::LiveQuiz) => {
                                let mut sessions = state.sessions.write().await;
                                if let Some(session) = sessions.get_mut(&pin) {
                                    let next_idx = session.current_question_index + 1;
                                    if next_idx >= session.quiz.questions.len() {
                                        session.status = GameStatus::Ended;
                                        drop(sessions);
                                        persist_session(&state, &pin).await;
                                        show_final_results(&state, &pin).await;
                                    } else {
                                        session.current_question_index = next_idx;
                                        session.answers.clear();
                                        let advance = session.advance.clone();
                                        let duration = session.quiz.questions.get(next_idx).map(|q| q.time_seconds).unwrap_or(10);
                                        drop(sessions);
                                        persist_session(&state, &pin).await;
                                        broadcast_question(&state, &pin, next_idx).await;

                                        if advance == AdvanceMode::Auto {
                                            let state_clone = state.clone();
                                            let pin_clone = pin.clone();
                                            tokio::spawn(async move {
                                                tokio::time::sleep(tokio::time::Duration::from_secs(duration as u64)).await;
                                                show_round_results(&state_clone, &pin_clone).await;
                                            });
                                        }
                                    }
                                }
                            }
                            None => {}
                        }
                    }

                    ClientMessage::ShowResults { pin } => {
                        show_round_results(&state, &pin).await;
                    }

                    ClientMessage::SubmitTest { pin, answers } => {
                        if player_id.is_empty() { continue; }
                        let mut sessions = state.sessions.write().await;
                        if let Some(session) = sessions.get_mut(&pin) {
                            if session.answers.iter().any(|a| a.player_id == player_id) {
                                continue;
                            }
                            let mut total_points = 0u32;
                            for sub in &answers {
                                if let Some(question) = session.quiz.questions.get(sub.question_index) {
                                    if let Some(correct_idx) = question.answers.iter().position(|a| a.is_correct) {
                                        let is_correct = sub.answer_index == correct_idx;
                                        let points = if is_correct { question.points } else { 0 };
                                        total_points += points;
                                        session.answers.push(PlayerAnswer {
                                            player_id: player_id.clone(),
                                            question_index: sub.question_index,
                                            answer_index: sub.answer_index,
                                            is_correct,
                                            time_ms: 0,
                                            points_earned: points,
                                        });
                                    }
                                }
                            }
                            if let Some(player) = session.players.iter_mut().find(|p| p.id == player_id) {
                                player.total_score += total_points;
                            }
                            let _ = tx.send(serde_json::to_string(&ServerMessage::TestComplete {
                                score: total_points,
                                total_questions: session.quiz.questions.len(),
                            }).unwrap());
                        }
                        drop(sessions);
                        persist_session(&state, &pin).await;

                        check_all_test_done(&state, &pin).await;
                    }

                    ClientMessage::EndGame { pin } => {
                        let mut sessions = state.sessions.write().await;
                        if let Some(session) = sessions.get_mut(&pin) {
                            session.status = GameStatus::Ended;
                        }
                        drop(sessions);
                        persist_session(&state, &pin).await;
                        show_final_results(&state, &pin).await;
                    }

                }
            }
        }
    }

    if !current_pin.is_empty() && !player_id.is_empty() {
        let mut sessions = state.sessions.write().await;
        if let Some(session) = sessions.get_mut(&current_pin) {
            session.players.retain(|p| p.id != player_id);
            session.answers.retain(|a| a.player_id != player_id);
            session.player_progress.remove(&player_id);

            let leave_msg = serde_json::to_string(&ServerMessage::PlayerLeft {
                player_id: player_id.clone(),
            }).unwrap();
            if let Some(host_senders) = state.host_senders.read().await.get(&current_pin) {
                for htx in host_senders {
                    let _ = htx.send(leave_msg.clone());
                }
            }
        }
        drop(sessions);
        persist_session(&state, &current_pin).await;

        // Remove player from ws_player_map
        let mut player_map = state.ws_player_map.write().await;
        if let Some(inner) = player_map.get_mut(&current_pin) {
            inner.remove(&player_id);
        }
    }

    send_task.abort();
}

async fn send_question_to_players(state: &Arc<AppState>, pin: &str) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let total = session.quiz.questions.len();

        if let Some(senders) = state.ws_senders.read().await.get(pin) {
            for (i, player) in session.players.iter().enumerate() {
                let q_idx = session.player_progress.get(&player.id).copied().unwrap_or(0);
                if let Some(question) = session.quiz.questions.get(q_idx) {
                    let qdata = QuestionData {
                        text: question.text.clone(),
                        time_seconds: question.time_seconds,
                        answers: question.answers.iter().enumerate().map(|(i, a)| AnswerData {
                            text: a.text.clone(),
                            color: a.color.clone(),
                            shape: a.shape.clone(),
                            index: i,
                        }).collect(),
                    };

                    let msg = serde_json::to_string(&ServerMessage::Question {
                        question: qdata,
                        total,
                        index: q_idx,
                    }).unwrap();

                    if let Some(stx) = senders.get(i) {
                        let _ = stx.send(msg);
                    }
                }
            }
        }

        drop(sessions);
        send_progress_to_host(state, pin).await;
    }
}

async fn send_progress_to_host(state: &Arc<AppState>, pin: &str) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let total_q = session.quiz.questions.len();
        let items: Vec<PlayerProgressItem> = session.players.iter().map(|p| {
            let q_idx = session.player_progress.get(&p.id).copied().unwrap_or(0);
            PlayerProgressItem {
                id: p.id.clone(),
                nickname: p.nickname.clone(),
                question_index: q_idx,
                total_questions: total_q,
                score: p.total_score,
                done: q_idx >= total_q,
            }
        }).collect();

        let msg = serde_json::to_string(&ServerMessage::Progress {
            players: items,
        }).unwrap();

        if let Some(host_senders) = state.host_senders.read().await.get(pin) {
            for htx in host_senders {
                let _ = htx.send(msg.clone());
            }
        }
    }
}

async fn broadcast_question(state: &Arc<AppState>, pin: &str, index: usize) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let total = session.quiz.questions.len();
        if let Some(question) = session.quiz.questions.get(index) {
            let qdata = QuestionData {
                text: question.text.clone(),
                time_seconds: question.time_seconds,
                answers: question.answers.iter().enumerate().map(|(i, a)| AnswerData {
                    text: a.text.clone(), color: a.color.clone(), shape: a.shape.clone(), index: i,
                }).collect(),
            };
            let msg = serde_json::to_string(&ServerMessage::Question {
                question: qdata, total, index,
            }).unwrap();
            if let Some(senders) = state.ws_senders.read().await.get(pin) {
                for stx in senders {
                    let _ = stx.send(msg.clone());
                }
            }
            let host_msg = serde_json::to_string(&ServerMessage::Question {
                question: QuestionData {
                    text: question.text.clone(),
                    time_seconds: question.time_seconds,
                    answers: question.answers.iter().enumerate().map(|(i, a)| AnswerData {
                        text: a.text.clone(), color: a.color.clone(), shape: a.shape.clone(), index: i,
                    }).collect(),
                },
                total, index,
            }).unwrap();
            if let Some(host_senders) = state.host_senders.read().await.get(pin) {
                for htx in host_senders {
                    let _ = htx.send(host_msg.clone());
                }
            }
        }
    }
}

async fn broadcast_test_start(state: &Arc<AppState>, pin: &str) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let total = session.quiz.questions.len();
        let total_time = session.quiz.total_time_seconds;
        let questions: Vec<QuestionData> = session.quiz.questions.iter().map(|q| QuestionData {
            text: q.text.clone(),
            time_seconds: 0,
            answers: q.answers.iter().enumerate().map(|(ai, a)| AnswerData {
                text: a.text.clone(), color: a.color.clone(), shape: a.shape.clone(), index: ai,
            }).collect(),
        }).collect();
        let msg = serde_json::to_string(&ServerMessage::TestStart {
            questions: questions.clone(),
            total,
            total_time_seconds: total_time,
        }).unwrap();
        if let Some(senders) = state.ws_senders.read().await.get(pin) {
            for stx in senders {
                let _ = stx.send(msg.clone());
            }
        }
        if let Some(host_senders) = state.host_senders.read().await.get(pin) {
            for htx in host_senders {
                let _ = htx.send(msg.clone());
            }
        }
    }
}

async fn check_all_test_done(state: &Arc<AppState>, pin: &str) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let all_done = session.players.len() > 0
            && session.players.iter().all(|p| {
                session.answers.iter().any(|a| a.player_id == p.id)
            });
        if all_done {
            drop(sessions);
            tokio::time::sleep(tokio::time::Duration::from_secs(1)).await;
            show_final_results(state, pin).await;
        } else {
            send_progress_to_host(state, pin).await;
        }
    }
}

async fn show_round_results(state: &Arc<AppState>, pin: &str) {
    show_round_results_with_next(state, pin, 0).await;
}

async fn show_round_results_with_next(state: &Arc<AppState>, pin: &str, next_in: u32) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let q_idx = session.current_question_index;
        if let Some(question) = session.quiz.questions.get(q_idx) {
            let correct_idx = question.answers.iter()
                .position(|a| a.is_correct).unwrap_or(0);

            let mut histogram = vec![0u32; question.answers.len()];
            for answer in &session.answers {
                if answer.answer_index < histogram.len() {
                    histogram[answer.answer_index] += 1;
                }
            }

            let mut sorted_players = session.players.clone();
            sorted_players.sort_by(|a, b| b.total_score.cmp(&a.total_score));
            let leaderboard: Vec<PlayerData> = sorted_players.iter().enumerate().map(|(i, p)| PlayerData {
                id: p.id.clone(),
                nickname: p.nickname.clone(),
                total_score: p.total_score,
                rank: i + 1,
            }).collect();

            let msg = serde_json::to_string(&ServerMessage::RoundResults {
                histogram,
                correct_index: correct_idx,
                leaderboard: leaderboard.clone(),
                next_in,
            }).unwrap();

            if let Some(host_senders) = state.host_senders.read().await.get(pin) {
                for htx in host_senders {
                    let _ = htx.send(msg.clone());
                }
            }
            if let Some(senders) = state.ws_senders.read().await.get(pin) {
                for stx in senders {
                    let _ = stx.send(msg.clone());
                }
            }
        }
    }
}

async fn show_final_results(state: &Arc<AppState>, pin: &str) {
    let sessions = state.sessions.read().await;
    if let Some(session) = sessions.get(pin) {
        let mut sorted_players = session.players.clone();
        sorted_players.sort_by(|a, b| b.total_score.cmp(&a.total_score));
        let leaderboard: Vec<PlayerData> = sorted_players.iter().enumerate().map(|(i, p)| PlayerData {
            id: p.id.clone(),
            nickname: p.nickname.clone(),
            total_score: p.total_score,
            rank: i + 1,
        }).collect();

        let msg = serde_json::to_string(&ServerMessage::FinalResults {
            leaderboard: leaderboard.clone(),
        }).unwrap();

        if let Some(host_senders) = state.host_senders.read().await.get(pin) {
            for htx in host_senders {
                let _ = htx.send(msg.clone());
            }
        }
        if let Some(senders) = state.ws_senders.read().await.get(pin) {
            for stx in senders {
                let _ = stx.send(msg.clone());
            }
        }
    }
}


