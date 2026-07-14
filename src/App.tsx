import { useState, useEffect } from 'react'
import { Dashboard } from './pages/Dashboard'
import { QuizBuilder } from './pages/QuizBuilder'
import { GameHost } from './pages/GameHost'
import { Settings } from './pages/Settings'
import { QuizCatalog } from './pages/QuizCatalog'
import { JeopardyBoard } from './pages/JeopardyBoard'
import { JeopardyHost } from './pages/JeopardyHost'
import { CipherGame } from './pages/CipherGame'
import { CreateOwnQuiz } from './pages/CreateOwnQuiz'
import { invoke } from '@tauri-apps/api/core'
import './styles/globals.css'

export type Quiz = {
  id: string
  title: string
  description: string
  questions: Question[]
  created_at: string
  tags?: string[]
  total_time_seconds?: number
}

export type Question = {
  id: string
  text: string
  time_seconds: number
  points: number
  answers: Answer[]
}

export type Answer = {
  id: string
  text: string
  is_correct: boolean
  color: string
  shape: string
}

export type GameSession = {
  pin: string
  quiz: Quiz
  status: string
  mode: string
  advance: string
  current_question_index: number
  players: Player[]
  player_progress: Record<string, number>
  server_port: number
}

export type Player = {
  id: string
  nickname: string
  total_score: number
  streak: number
  joined_at: string
}

export type ServerInfo = {
  ip: string
  port: number
  local_url: string
}

export type AppSettings = {
  default_mode: string
  default_advance: string
  default_time_seconds: number
  default_points: number
  style: string
  dark_mode: boolean
}

type Page = 'dashboard' | 'builder' | 'game' | 'settings' | 'catalog' | 'jeopardy' | 'jeopardy-host' | 'cipher' | 'create-own'

function applyStyle(style: string, dark: boolean) {
  document.documentElement.className = `style-${style}${dark ? ' dark' : ''}`
}

function App() {
  const [page, setPage] = useState<Page>('dashboard')
  const [editQuizId, setEditQuizId] = useState<string | null>(null)
  const [gamePin, setGamePin] = useState<string | null>(null)
  const [serverInfo, setServerInfo] = useState<ServerInfo | null>(null)
  const [showIp, setShowIp] = useState(false)
  const [currentStyle, setCurrentStyle] = useState('editorial')
  const [darkMode, setDarkMode] = useState(false)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const [scale, setScale] = useState(100)
  const [prevPage, setPrevPage] = useState<Page | null>(null)
  const [activeSessions, setActiveSessions] = useState<GameSession[]>([])
  const [jeopardyTemplate, setJeopardyTemplate] = useState<any>(null)
  const [jeopardyHostPin, setJeopardyHostPin] = useState<string | null>(null)
  const [jeopardySetup, setJeopardySetup] = useState<any>(null)
  const [cipherTemplate, setCipherTemplate] = useState<any>(null)

  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement)
    document.addEventListener('fullscreenchange', handler)
    return () => document.removeEventListener('fullscreenchange', handler)
  }, [])

  useEffect(() => {
    invoke<GameSession[]>('check_active_sessions').then(sessions => {
      setActiveSessions(sessions.filter(s => s.status !== 'Ended'))
    }).catch(() => {})
  }, [])

  function handleCatalogImport(title: string, description: string, questions: any[], tag: string) {
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
    const colors = ['#FF4444','#4488FF','#FFBB33','#44CC44']
    const shapes = ['тЦ│','тЧЗ','тЧЛ','тШЖ']
    const now = new Date().toISOString()
    const quiz: Quiz = {
      id, title, description, created_at: now, tags: [tag],
      questions: questions.map((q, qi) => ({
        id: crypto.randomUUID?.() || id + '-q' + qi,
        text: q.text,
        time_seconds: q.time_seconds || 20,
        points: q.points || 10,
        answers: q.answers.map((a: any, ai: number) => ({
          id: crypto.randomUUID?.() || id + '-q' + qi + '-a' + ai,
          text: a.text,
          is_correct: a.is_correct,
          color: colors[ai] || '#666',
          shape: shapes[ai] || 'тЧП',
        }))
      }))
    }
    invoke('save_quiz', { quiz }).then(() => {
      setEditQuizId(id)
      setPage('builder')
    }).catch(console.error)
  }

  function handlePlayJeopardy(template: any) {
    setJeopardySetup(template)
  }

  async function handleStartJeopardyLocal() {
    setJeopardyTemplate(jeopardySetup)
    setJeopardySetup(null)
    setPage('jeopardy')
  }

  function dismissSession(pin: string) {
    setActiveSessions(prev => prev.filter(s => s.pin !== pin))
    invoke('clear_active_session', { pin }).catch(() => {})
  }

  function broadcastStyleToPlayers(style: string, dark: boolean) {
    invoke('broadcast_style', { style, dark }).catch(() => {})
  }

  function toggleFullscreen() {
    if (document.fullscreenElement) {
      document.exitFullscreen()
    } else {
      document.documentElement.requestFullscreen()
    }
  }

  useEffect(() => {
    invoke<AppSettings>('get_settings').then(s => {
      setCurrentStyle(s.style)
      setDarkMode(s.dark_mode)
      applyStyle(s.style, s.dark_mode)
    }).catch(() => {})
  }, [])

  useEffect(() => {
    let cancelled = false
    const poll = () => {
      invoke<ServerInfo>('get_server_info').then((info) => {
        if (cancelled) return
        if (info.port > 0) {
          setServerInfo(info)
        } else {
          setTimeout(poll, 200)
        }
      }).catch(() => { if (!cancelled) setTimeout(poll, 500) })
    }
    poll()
    return () => { cancelled = true }
  }, [])

  return (
    <div className="app">
      <header className="app-header">
        <div className="header-left">
            <h1 className="app-logo" onClick={() => { setPage('dashboard'); setEditQuizId(null); setGamePin(null) }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{width:22,height:22,verticalAlign:'middle',marginRight:6}}><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>
              ╨Ш╨╗╤М╨п╨║╨╗╨░╤Б╤Б
            </h1>
          <span className="app-subtitle">╨Ш╨╜╤В╨╡╤А╨░╨║╤В╨╕╨▓╨╜╤Л╨╡ ╨▓╨╕╨║╤В╨╛╤А╨╕╨╜╤Л</span>
        </div>
        {serverInfo && (
          <div className="server-info" onClick={() => setShowIp(!showIp)} style={{ cursor: 'pointer' }} title={showIp ? '╨б╨║╤А╤Л╤В╤М' : '╨Я╨╛╨║╨░╨╖╨░╤В╤М IP'}>
            <span className="dot" />
            {showIp ? (
              <span>{serverInfo.ip}:{serverInfo.port}</span>
            ) : (
              <span>╨б╨╡╤А╨▓╨╡╤А: тАвтАвтАвтАв</span>
            )}
          </div>
        )}
        <button className="btn-fullscreen" onClick={toggleFullscreen} title={isFullscreen ? '╨Т╤Л╨╣╤В╨╕ ╨╕╨╖ ╨┐╨╛╨╗╨╜╨╛╤Н╨║╤А╨░╨╜╨╜╨╛╨│╨╛ ╤А╨╡╨╢╨╕╨╝╨░' : '╨Я╨╛╨╗╨╜╨╛╤Н╨║╤А╨░╨╜╨╜╤Л╨╣ ╤А╨╡╨╢╨╕╨╝'}>
          {isFullscreen ? (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M8 3v3a2 2 0 0 1-2 2H3"/><path d="M21 8h-3a2 2 0 0 1-2-2V3"/><path d="M3 16h3a2 2 0 0 1 2 2v3"/><path d="M16 21v-3a2 2 0 0 1 2-2h3"/></svg>
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><path d="M8 3H5a2 2 0 0 0-2 2v3"/><path d="M21 8V5a2 2 0 0 0-2-2h-3"/><path d="M16 21h3a2 2 0 0 0 2-2v-3"/><path d="M3 16v3a2 2 0 0 0 2 2h3"/></svg>
          )}
        </button>
        <div className="zoom-controls">
          <button className="btn-zoom" onClick={() => setScale(s => Math.max(50, s - 10))} title="╨г╨╝╨╡╨╜╤М╤И╨╕╤В╤М">тИТ</button>
          <span className="zoom-value">{scale}%</span>
          <button className="btn-zoom" onClick={() => setScale(s => Math.min(200, s + 10))} title="╨г╨▓╨╡╨╗╨╕╤З╨╕╤В╤М">+</button>
        </div>
        <button className="btn-settings" onClick={() => { setPrevPage(page); setPage('settings') }} title="╨Э╨░╤Б╤В╤А╨╛╨╣╨║╨╕">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="20" height="20"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>
        </button>
      </header>

      {activeSessions.length > 0 && (
        <div className="resume-banner">
          <span>╨Ю╨▒╨╜╨░╤А╤Г╨╢╨╡╨╜╨░ ╨░╨║╤В╨╕╨▓╨╜╨░╤П ╨╕╨│╤А╨░. ╨Я╤А╨╛╨┤╨╛╨╗╨╢╨╕╤В╤М ╤Б ╤В╨╛╨│╨╛ ╨╢╨╡ ╨╝╨╡╤Б╤В╨░?</span>
          <div className="resume-banner-actions">
            {activeSessions.map(s => (
              <button key={s.pin} className="btn btn-primary" onClick={() => { setGamePin(s.pin); setPage('game') }}>
                ╨Ш╨│╤А╨░ #{s.pin} ({s.mode === 'live' ? '╨Т╨╕╨║╤В╨╛╤А╨╕╨╜╨░' : '╨Я╤А╨╛╨▓╨╡╤А╨╛╤З╨╜╨░╤П ╤А╨░╨▒╨╛╤В╨░'})
              </button>
            ))}
            <button className="btn" onClick={() => {
              activeSessions.forEach(s => dismissSession(s.pin))
            }}>╨Ч╨░╨║╤А╤Л╤В╤М</button>
          </div>
        </div>
      )}

      <main className="app-main" style={{ '--scale': scale / 100 } as React.CSSProperties}>
        {page === 'dashboard' && (
          <Dashboard
            onEditQuiz={(id) => { setEditQuizId(id); setPage('builder') }}
            onStartGame={(pin) => { setGamePin(pin); setPage('game') }}
            onCatalog={() => setPage('catalog')}
          />
        )}
        {page === 'builder' && (
          <QuizBuilder
            quizId={editQuizId}
            onBack={() => setPage('dashboard')}
            onCreateOwn={() => setPage('create-own')}
          />
        )}
        {gamePin && (
          <div style={{ display: page === 'game' ? '' : 'none' }}>
            <GameHost
              pin={gamePin}
              serverInfo={serverInfo}
              onBack={() => { setGamePin(null); setPage('dashboard') }}
            />
          </div>
        )}
        {page === 'settings' && (
          <Settings
            onBack={() => setPage(prevPage ?? 'dashboard')}
            onStyleChange={(style) => {
              setCurrentStyle(style)
              applyStyle(style, darkMode)
              broadcastStyleToPlayers(style, darkMode)
            }}
            onDarkModeChange={(dark) => {
              setDarkMode(dark)
              applyStyle(currentStyle, dark)
              broadcastStyleToPlayers(currentStyle, dark)
            }}
          />
        )}
        {page === 'catalog' && (
          <QuizCatalog
            onImport={handleCatalogImport}
            onBack={() => setPage('dashboard')}
            onPlayJeopardy={handlePlayJeopardy}
            onPlayCipher={(template) => { setCipherTemplate(template); setPage('cipher') }}
            onPlayCreateOwn={() => setPage('create-own')}
          />
        )}
        {page === 'jeopardy' && jeopardyTemplate && (
          <JeopardyBoard
            template={jeopardyTemplate}
            onBack={() => { setJeopardyTemplate(null); setPage('catalog') }}
          />
        )}
        {page === 'jeopardy-host' && jeopardyHostPin && (
          <JeopardyHost
            pin={jeopardyHostPin}
            serverInfo={serverInfo}
            onBack={() => { setJeopardyHostPin(null); setPage('catalog') }}
          />
        )}
        {page === 'cipher' && cipherTemplate && (
          <CipherGame
            template={cipherTemplate}
            onBack={() => { setCipherTemplate(null); setPage('catalog') }}
          />
        )}
        {page === 'create-own' && (
          <CreateOwnQuiz
            onBack={() => setPage('catalog')}
          />
        )}
      </main>

      {/* Jeopardy setup modal */}
      {jeopardySetup && (
        <div className="modal-overlay" onClick={() => setJeopardySetup(null)}>
          <div className="glass-card" style={{ maxWidth: 420, width: '90%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16, borderRadius: 16 }} onClick={e => e.stopPropagation()}>
            <h2 style={{ textAlign: 'center' }}>{jeopardySetup.emoji} {jeopardySetup.title}</h2>
            <p style={{ textAlign: 'center', color: 'var(--text-secondary)', fontSize: 14, lineHeight: 1.5 }}>{jeopardySetup.description}</p>
            <div style={{ height: 1, background: 'var(--border)', width: '100%' }} />
            <button className="btn btn-primary" style={{ textAlign: 'center', fontSize: 18, padding: '16px 24px' }} onClick={handleStartJeopardyLocal}>
              ЁЯЦея╕П ╨Ш╨│╤А╨░╤В╤М
            </button>
            <button className="btn" style={{ textAlign: 'center', marginTop: 4 }} onClick={() => setJeopardySetup(null)}>
              ╨Ю╤В╨╝╨╡╨╜╨░
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

export default App
