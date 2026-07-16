import { invoke } from '@tauri-apps/api/core'
import { useState } from 'react'

type AppEntry = {
  id: string
  title: string
  description: string
  emoji: string
  gradient: string
  badge?: string
  action: 'navigate' | 'download' | 'launch'
  path?: string
  dl_key?: string
}

const APPS: AppEntry[] = [
  {
    id: 'ilyaklass',
    title: 'ИльЯкласс',
    description: 'Интерактивные викторины и проверочные работы. Ученики отвечают с телефона — учитель видит результаты в реальном времени.',
    emoji: '🎯',
    gradient: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
    badge: 'Открыть',
    action: 'navigate',
    path: 'dashboard',
  },
  {
    id: 'svoya-igra',
    title: 'Своя игра',
    description: 'Классическая Jeopardy на одном компьютере. Выбирайте категории, отвечайте на вопросы и соревнуйтесь с друзьями.',
    emoji: '💰',
    gradient: 'linear-gradient(135deg, #f093fb 0%, #f5576c 100%)',
    badge: 'Скачать',
    action: 'download',
    dl_key: 'svoya-igra',
  },
  {
    id: 'millionaire',
    title: 'Кто хочет стать миллионером',
    description: 'Легендарная игра с 15 вопросами, несгораемыми суммами и подсказками. Играйте вдвоём за одним компьютером.',
    emoji: '💎',
    gradient: 'linear-gradient(135deg, #4facfe 0%, #00f2fe 100%)',
    badge: 'Скачать',
    action: 'download',
    dl_key: 'millionaire',
  },
]

type Props = {
  onNavigate: (page: string) => void
}

export function Ecosystem({ onNavigate }: Props) {
  const [status, setStatus] = useState<Record<string, string>>({})

  const handleClick = async (app: AppEntry) => {
    if (app.action === 'navigate' && app.path) {
      onNavigate(app.path)
    } else if (app.action === 'download' && app.dl_key) {
      setStatus(prev => ({ ...prev, [app.id]: 'Скачивание...' }))
      try {
        const path = await invoke<string>('download_app', { app: app.dl_key })
        setStatus(prev => ({ ...prev, [app.id]: `Сохранено: ${path}` }))
      } catch (e) {
        setStatus(prev => ({ ...prev, [app.id]: `Ошибка: ${e}` }))
      }
    }
  }

  return (
    <div className="ecosystem">
      <div className="ecosystem-header">
        <div className="ecosystem-header-content">
          <h1 className="ecosystem-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style={{width:24,height:24,verticalAlign:'middle',marginRight:8}}>
              <path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>
            </svg>
            QuizKit
          </h1>
          <p className="ecosystem-subtitle">Экосистема интерактивного образования</p>
          <p className="ecosystem-desc">
            Набор программ для проведения викторин, игр и сбора заданий в классе.
            Всё работает локально — без интернета.
          </p>
        </div>
      </div>

      <div className="ecosystem-grid">
        {APPS.map(app => (
          <div
            key={app.id}
            className="ecosystem-card"
            onClick={() => handleClick(app)}
            role="button"
            tabIndex={0}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') handleClick(app) }}
          >
            <div className="ecosystem-card-bg" style={{ background: app.gradient }} />
            <div className="ecosystem-card-content">
              <span className="ecosystem-card-emoji">{app.emoji}</span>
              <h3 className="ecosystem-card-title">{app.title}</h3>
              <p className="ecosystem-card-desc">{app.description}</p>
              {app.badge && (
                <span className="ecosystem-card-badge">
                  {status[app.id] || app.badge}
                </span>
              )}
            </div>
          </div>
        ))}
      </div>

      <div className="ecosystem-footer">
        <p>QuizKit — проект с открытым исходным кодом</p>
      </div>
    </div>
  )
}
