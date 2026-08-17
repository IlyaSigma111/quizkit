import { useState, useEffect, useRef, useCallback } from 'react'
import type { Player, ServerInfo, GameSession } from '../App'
import { invoke } from '@tauri-apps/api/core'
import { QRCodeSVG } from 'qrcode.react'
import { playCountdown, playTick } from '../lib/sounds'

function qrColor() {
  return getComputedStyle(document.documentElement).getPropertyValue('--text').trim() || '#e8e8f0'
}
function qrBg() {
  const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg-card').trim()
  if (!bg || bg.startsWith('rgba') || bg.startsWith('transparent')) return '#ffffff'
  return bg
}

type Props = {
  pin: string
  serverInfo: ServerInfo | null
  onBack: () => void
}

type WSMessage = {
  type: string
  [key: string]: any
}

type LobbyPlayer = {
  id: string
  nickname: string
}

type ProgressPlayer = {
  id: string
  nickname: string
  question_index: number
  total_questions: number
  score: number
  done: boolean
}

type QuestionData = {
  text: string
  image?: string
  time_seconds: number
  answers: { text: string; color: string; shape: string; index: number }[]
}

type RoundResultsData = {
  histogram: number[]
  correct_index: number
  leaderboard: { id: string; nickname: string; total_score: number; rank: number }[]
  next_in: number
}

const COLORS = ['#FF4444', '#4488FF', '#FFBB33', '#44CC44']
const SHAPES = ['△', '◇', '○', '☆']

export function GameHost({ pin, serverInfo, onBack }: Props) {
  const [status, setStatus] = useState<'lobby' | 'active' | 'final'>('lobby')
  const [qrExpanded, setQrExpanded] = useState(false)
  const [mode, setMode] = useState<'Test' | 'LiveQuiz'>('Test')
  const [advance, setAdvance] = useState<'Auto' | 'Manual'>('Auto')
  const [players, setPlayers] = useState<LobbyPlayer[]>([])
  const [progress, setProgress] = useState<ProgressPlayer[]>([])
  const [leaderboard, setLeaderboard] = useState<Player[]>([])

  const [countdown, setCountdown] = useState<number | null>(null)
  const [liveQuestion, setLiveQuestion] = useState<QuestionData | null>(null)
  const [liveIndex, setLiveIndex] = useState(0)
  const [liveTotal, setLiveTotal] = useState(0)
  const [answeredCount, setAnsweredCount] = useState(0)
  const [totalPlayers, setTotalPlayers] = useState(0)
  const [roundResults, setRoundResults] = useState<RoundResultsData | null>(null)
  const [nextIn, setNextIn] = useState(0)
  const [timerWidth, setTimerWidth] = useState(100)

  const wsRef = useRef<WebSocket | null>(null)
  const timerRef = useRef<number | null>(null)
  const countdownRef = useRef<number | null>(null)
  const nextInRef = useRef<number | null>(null)

  const connect = useCallback(() => {
    if (!serverInfo || serverInfo.port === 0) return
    const url = `ws://127.0.0.1:${serverInfo.port}/ws`
    if (wsRef.current?.url === url && wsRef.current?.readyState === WebSocket.OPEN) return
    wsRef.current?.close()
    const ws = new WebSocket(url)

    ws.onopen = () => ws.send(JSON.stringify({ type: 'register_host', pin }))

    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data)

      switch (msg.type) {
        case 'player_joined':
          playTick()
          setPlayers((prev) => {
            if (prev.find((p) => p.id === msg.player.id)) return prev
            return [...prev, { id: msg.player.id, nickname: msg.player.nickname }]
          })
          setTimeout(() => {
            const countEl = document.getElementById('lobby-count-anim')
            if (countEl) {
              countEl.classList.remove('count-bump')
              void countEl.offsetWidth
              countEl.classList.add('count-bump')
            }
          }, 10)
          break

        case 'player_left':
          setPlayers((prev) => prev.filter((p) => p.id !== msg.player_id))
          break

        case 'game_starting':
          setStatus('active')
          setCountdown(msg.countdown || 3)
          setLiveQuestion(null)
          setRoundResults(null)
          startCountdown(msg.countdown || 3)
          playCountdown()
          break

        case 'question':
          setStatus('active')
          setCountdown(null)
          setLiveQuestion(msg.question)
          setLiveIndex(msg.index)
          setLiveTotal(msg.total)
          setAnsweredCount(0)
          setRoundResults(null)
          if (msg.question.time_seconds > 0) startTimer(msg.question.time_seconds)
          break

        case 'host_update':
          setAnsweredCount(msg.answered)
          setTotalPlayers(msg.total_players)
          break

        case 'round_results':
          if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null }
          if (nextInRef.current) { clearInterval(nextInRef.current); nextInRef.current = null }
          setRoundResults({ histogram: msg.histogram, correct_index: msg.correct_index, leaderboard: msg.leaderboard, next_in: msg.next_in })
          if (msg.next_in > 0) {
            setNextIn(msg.next_in)
            let rem = msg.next_in
            nextInRef.current = window.setInterval(() => {
              rem--
              if (rem <= 0) { setNextIn(0); if (nextInRef.current) { clearInterval(nextInRef.current); nextInRef.current = null } }
              else setNextIn(rem)
            }, 1000)
          }
          break

        case 'progress':
          setStatus('active')
          setProgress(msg.players)
          break

        case 'final_results':
          setStatus('final')
          setLeaderboard(msg.leaderboard)
          break
      }
    }

    ws.onerror = (e) => console.error('WS err, retrying in 2s:', e)
    ws.onclose = () => console.log('WS closed')
    wsRef.current = ws
  }, [pin, serverInfo])

  useEffect(() => {
    invoke<GameSession>('get_game_state', { pin }).then((session) => {
      if (session) {
        setMode(session.mode as 'Test' | 'LiveQuiz')
        setAdvance(session.advance as 'Auto' | 'Manual')
      }
    }).catch(console.error)

    connect()
    return () => {
      wsRef.current?.close()
    }
  }, [pin, serverInfo, connect])

  const startCountdown = (n: number) => {
    if (countdownRef.current) clearInterval(countdownRef.current)
    let remaining = n
    countdownRef.current = window.setInterval(() => {
      remaining--
      if (remaining <= 0) {
        if (countdownRef.current) clearInterval(countdownRef.current)
        countdownRef.current = null
        setCountdown(null)
      } else {
        setCountdown(remaining)
      }
    }, 1000)
  }

  const startTimer = (seconds: number) => {
    if (timerRef.current) clearInterval(timerRef.current)
    setTimerWidth(100)
    const step = 100 / (seconds * 10)
    let pct = 100
    timerRef.current = window.setInterval(() => {
      pct -= step
      if (pct <= 0) {
        if (timerRef.current) clearInterval(timerRef.current)
        timerRef.current = null
        setTimerWidth(0)
      } else {
        setTimerWidth(pct)
      }
    }, 100)
  }

  const handleStart = () => {
    wsRef.current?.send(JSON.stringify({ type: 'start_game', pin }))
  }

  const handleNextQuestion = () => {
    wsRef.current?.send(JSON.stringify({ type: 'next_question', pin }))
  }

  const handleEnd = () => {
    wsRef.current?.send(JSON.stringify({ type: 'end_game', pin }))
  }

  const handleExport = async () => {
    try {
      const path = await invoke<string>('export_results', { pin })
      alert('✅ Результаты сохранены:\n' + path)
    } catch (e) {
      alert('❌ Ошибка экспорта: ' + e)
    }
  }

  const doneCount = progress.filter(p => p.done).length

  return (
    <div className="game-host">
      <div className="game-header">
        <button className="btn btn-secondary" onClick={onBack}>← Выйти</button>
        <div className="connection-info">
          {serverInfo && (
            <span>Сервер: <strong>{serverInfo.ip}:{serverInfo.port}</strong></span>
          )}
        </div>
      </div>

      {status === 'lobby' && (
        <div className="lobby-layout" style={{ flexDirection: 'column', height: '100%', alignItems: 'stretch' }}>
          <style>{`
            @keyframes popIn {
              0% { transform: scale(0.8) translateY(10px); opacity: 0; }
              50% { transform: scale(1.05) translateY(-2px); opacity: 1; }
              100% { transform: scale(1) translateY(0); opacity: 1; }
            }
            .player-chip {
              animation: popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards;
              display: inline-flex;
              align-items: center;
              gap: 8px;
              padding: 14px 28px;
              background: var(--bg-card);
              color: var(--text);
              border-radius: 100px;
              font-weight: 700;
              font-size: 22px;
              box-shadow: 0 4px 12px rgba(0,0,0,0.05);
              border: 2px solid var(--primary);
              transition: transform 0.2s;
            }
            .player-chip:hover {
              transform: translateY(-2px);
              box-shadow: 0 6px 16px rgba(0,0,0,0.1);
            }
            .count-bump {
              animation: bump 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275);
              display: inline-block;
            }
            @keyframes bump {
              0% { transform: scale(1); }
              30% { transform: scale(1.4); color: var(--success); }
              100% { transform: scale(1); }
            }
            .lobby-header-banner {
              display: flex;
              justify-content: space-between;
              align-items: center;
              background: var(--bg-card);
              padding: 24px 48px;
              border-radius: var(--radius);
              box-shadow: var(--shadow);
              margin-bottom: 24px;
              border: 1px solid var(--border);
            }
            .lobby-main-area {
              flex: 1;
              background: var(--bg-card);
              border-radius: var(--radius);
              padding: 40px;
              box-shadow: var(--shadow);
              display: flex;
              flex-direction: column;
          border: 1px solid var(--border);
            }
          `}</style>

          {/* Top Banner */}
          <div className="lobby-header-banner glass-card" style={{ display: 'flex', flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: '40px', padding: '24px 32px', marginBottom: '24px' }}>
            
            <div style={{ flex: 1, textAlign: 'right' }}>
              <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-secondary)', marginBottom: 12, lineHeight: 1.2 }}>
                Отсканируйте камерой телефона:
              </div>
              <div style={{ fontSize: 16, color: 'var(--text-secondary)' }}>
                Или введите адрес вручную:<br/>
                <strong style={{ color: 'var(--text)', fontSize: 20, background: 'var(--bg-input)', padding: '6px 16px', borderRadius: 'var(--radius)', marginTop: 8, display: 'inline-block', border: '1px solid var(--border)' }}>http://{serverInfo?.ip}:{serverInfo?.port}</strong>
              </div>
              <div style={{ marginTop: 24, display: 'inline-block', textAlign: 'left', background: 'var(--bg-input)', padding: '12px 16px', borderRadius: 'var(--radius)', border: '2px solid var(--border)', boxShadow: '4px 4px 0 rgba(0,0,0,0.1)' }}>
                <strong style={{ color: 'var(--text)', fontSize: 14 }}>⚠️ Раздаете Wi-Fi с телефона?</strong>
                <div style={{ fontSize: 13, color: 'var(--text-secondary)', marginTop: 4, lineHeight: 1.4 }}>
                  Не забудьте снять лимит в настройках точки доступа<br/>(обычно по умолчанию стоит максимум 8 устройств).
                </div>
              </div>
            </div>

            <div style={{ 
              background: '#fff', 
              padding: '16px', 
              borderRadius: 'var(--radius)', 
              boxShadow: 'var(--shadow)',
              border: '2px solid #000',
              transform: 'scale(1)',
              animation: 'popIn 0.6s cubic-bezier(0.175, 0.885, 0.32, 1.275)'
            }}>
              {serverInfo && (
                <QRCodeSVG
                  value={`http://${serverInfo.ip}:${serverInfo.port}/player?pin=${pin}`}
                  size={180}
                  bgColor="#fff"
                  fgColor="#000"
                />
              )}
            </div>

            <div style={{ flex: 1 }}></div>
          </div>

          {/* Main Area */}
          <div className="lobby-main-area">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 32 }}>
              <h2 style={{ fontSize: 32, margin: 0, display: 'flex', alignItems: 'center' }}>
                Ученики 
                <span style={{ background: 'var(--bg-input)', padding: '4px 20px', borderRadius: 'var(--radius)', fontSize: 28, marginLeft: 16, fontWeight: 800, color: 'var(--primary)', border: '1px solid var(--border)' }} className="count-bump" key={players.length}>
                  {players.length}
                </span>
              </h2>
              <button
                className="btn btn-primary"
                style={{ fontSize: 24, padding: '18px 56px', borderRadius: 'var(--radius)', boxShadow: '0 8px 32px var(--primary-glow)', fontWeight: 800 }}
                disabled={players.length === 0}
                onClick={handleStart}
              >
                Начать игру ▶
              </button>
            </div>
            
            <div style={{ flex: 1, overflowY: 'auto', paddingRight: 8 }}>
              {players.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-secondary)', fontSize: 24, flexDirection: 'column', gap: 24 }}>
                  <div className="spinner" style={{ width: 80, height: 80, borderWidth: 8 }}></div>
                  <div style={{ fontWeight: 700 }}>Ожидаем подключения игроков...</div>
                  <div style={{ fontSize: 18, opacity: 0.8 }}>Отправьте им PIN или покажите QR-код</div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 20, alignContent: 'flex-start' }}>
                  {players.map((p) => (
                    <div key={p.id} className="player-chip">
                      <span style={{ opacity: 0.5, marginRight: 4 }}>👤</span> {p.nickname}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {status === 'active' && mode === 'Test' && (
        <div className="active-screen">
          <h2>Проверочная работа идёт</h2>
          <div className="progress-summary">
            <div className="progress-stat">
              <span className="stat-num">{progress.length}</span>
              <span className="stat-label">Учеников</span>
            </div>
            <div className="progress-stat">
              <span className="stat-num">{doneCount}</span>
              <span className="stat-label">Завершили</span>
            </div>
          </div>
          <div className="progress-list">
            {progress.map((p) => (
              <div key={p.id} className={`progress-row ${p.done ? 'done' : ''}`}>
                <span className="pr-name">{p.nickname}</span>
                <div className="pr-bar-wrap">
                  <div
                    className="pr-bar"
                    style={{ width: `${(Math.min(p.question_index, p.total_questions) / p.total_questions) * 100}%` }}
                  />
                </div>
                <span className="pr-info">
                  {p.done ? 'Готово' : `${Math.min(p.question_index, p.total_questions)}/${p.total_questions}`}
                </span>
                <span className="pr-score">{p.score} б.</span>
              </div>
            ))}
          </div>
          <button className="btn btn-danger" onClick={handleEnd}>
            Завершить
          </button>
        </div>
      )}

      {status === 'active' && mode === 'LiveQuiz' && (
        <div className="active-screen live-active">
          {countdown !== null && (
            <div className="host-countdown-overlay">
              <div className="host-countdown-number">{countdown}</div>
              <p>Приготовьтесь!</p>
            </div>
          )}

          {liveQuestion !== null && roundResults === null && (
            <div className="live-question-screen">
              <div className="q-progress-host">
                Вопрос {liveIndex + 1} / {liveTotal}
              </div>
              <h2 className="q-text-host">{liveQuestion.text}</h2>
              {liveQuestion.image && (
                <img src={liveQuestion.image} alt="Question" style={{ maxWidth: '100%', maxHeight: 240, objectFit: 'contain', borderRadius: 'var(--radius)', margin: '10px auto' }} />
              )}

              {liveQuestion.time_seconds > 0 && (
                <div className="timer-bar">
                  <div className="timer-fill" style={{ width: `${timerWidth}%` }} />
                </div>
              )}

              <div className="answers-grid-host">
                {liveQuestion.answers.map((a, i) => (
                  <div
                    key={i}
                    className="answer-card-host"
                    style={{ backgroundColor: COLORS[i] || '#666' }}
                  >
                    <span className="shape">{SHAPES[i] || '?'}</span>
                    <span className="text">{a.text}</span>
                  </div>
                ))}
              </div>

              <div className="answered-counter">
                {answeredCount} / {totalPlayers || players.length} ответили
              </div>

              {advance === 'Manual' && (
                <button className="btn btn-primary" onClick={handleNextQuestion}>
                  ➡ Следующий вопрос
                </button>
              )}
            </div>
          )}

          {roundResults !== null && (
            <div className="live-results-screen">
              <div className="rr-header">
                <span className="rr-label">Результаты раунда</span>
                <span className="rr-answers-count">
                  {roundResults.histogram.reduce((a: number, b: number) => a + b, 0)} ответов
                </span>
              </div>
              <div className="rr-correct">
                Правильный ответ: <strong>Вариант {roundResults.correct_index + 1}</strong>
              </div>
              <div className="rr-bars">
                {roundResults.histogram.map((count, i) => {
                  const max = Math.max(...roundResults.histogram, 1)
                  const total = roundResults.histogram.reduce((a: number, b: number) => a + b, 0)
                  const pct = total > 0 ? Math.round((count / total) * 100) : 0
                  const isCorrect = i === roundResults.correct_index
                  return (
                    <div key={i} className={`rr-bar-row ${isCorrect ? 'correct' : ''}`}>
                      <div className="rr-bar-label">
                        <span className="rr-bar-color" style={{ background: COLORS[i] || '#666' }} />
                        <span>{isCorrect ? '✅' : SHAPES[i] || '?'} Вариант {i + 1}</span>
                      </div>
                      <div className="rr-bar-track">
                        <div
                          className="rr-bar-fill"
                          style={{
                            width: `${(count / max) * 100}%`,
                            background: isCorrect ? '#2ecc71' : COLORS[i] || '#666',
                          }}
                        />
                      </div>
                      <span className="rr-bar-stat">{count} ({pct}%)</span>
                    </div>
                  )
                })}
              </div>
              <div className="rr-divider" />
              <div className="rr-lb">
                <h3>Таблица лидеров</h3>
                <div className="rr-lb-rows">
                  {roundResults.leaderboard.map((p, idx) => (
                    <div key={p.id} className={`rr-lb-row ${idx < 3 ? 'top' : ''}`}>
                      <span className="rr-lb-rank">{(idx < 3 ? ['#1', '#2', '#3'][idx] : `#${p.rank}`)}</span>
                      <span className="rr-lb-name">{p.nickname}</span>
                      <span className="rr-lb-score">{p.total_score} баллов</span>
                    </div>
                  ))}
                </div>
              </div>
              {nextIn > 0 && (
                <div className="rr-next-timer">
                  Следующий вопрос через <strong>{nextIn}с</strong>
                </div>
              )}
              {advance === 'Manual' && (
                <button className="btn btn-primary" onClick={handleNextQuestion} style={{ alignSelf: 'center' }}>
                  ➡ Следующий вопрос
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {status === 'final' && (
        <div className="final-screen">
          <h2>Игра завершена!</h2>
          <div className="podium">
            {leaderboard.slice(0, 3).map((p, i) => (
              <div key={p.id} className={`podium-item place-${i + 1}`}>
                <div className="podium-emoji">{['#1', '#2', '#3'][i]}</div>
                <div className="podium-name">{p.nickname}</div>
                <div className="podium-score">{p.total_score}</div>
              </div>
            ))}
          </div>
          <div className="final-list">
            {leaderboard.slice(3).map((p, i) => (
              <div key={p.id} className="final-row">
                <span>{i + 4}.</span>
                <span>{p.nickname}</span>
                <span>{p.total_score}</span>
              </div>
            ))}
          </div>
          <div className="final-actions">
            <button className="btn btn-secondary" onClick={onBack}>← На главную</button>
            <button className="btn btn-primary" onClick={handleExport}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Экспорт CSV
            </button>
          </div>
        </div>
      )}

      {qrExpanded && serverInfo && (
        <div className="modal-overlay" onClick={() => setQrExpanded(false)}>
          <div className="qr-expanded" onClick={e => e.stopPropagation()}>
            <QRCodeSVG
               value={`http://${serverInfo.ip}:${serverInfo.port}/player?pin=${pin}&style=${document.documentElement.className.match(/style-(\S+)/)?.[1]||'editorial'}${document.documentElement.classList.contains('dark') ? '&dark=1' : ''}`}
              size={320}
              bgColor={qrBg()}
              fgColor={qrColor()}
            />
            <p className="qr-url">{serverInfo.ip}:{serverInfo.port}</p>
            <p className="qr-hint">Наведи камеру на QR</p>
            <button className="btn btn-secondary" onClick={() => setQrExpanded(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  )
}
