import { useState, useEffect } from 'react'
import { invoke } from '@tauri-apps/api/core'

type AppSettings = {
  default_mode: string
  default_advance: string
  default_time_seconds: number
  default_points: number
  style: string
  dark_mode: boolean
  internet_check: boolean
}

type Props = {
  onBack: () => void
  onStyleChange: (style: string) => void
  onDarkModeChange: (dark: boolean) => void
}

const MODES = [
  { value: 'test', label: 'Проверочная работа', icon: '<path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/>', desc: 'Каждый в своём темпе' },
  { value: 'live', label: 'Викторина', icon: '<polygon points="5 3 19 12 5 21 5 3"/>', desc: 'Все одновременно на время' },
]

const ADVANCES = [
  { value: 'auto', label: 'Автоматически', icon: '<circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>', desc: 'Таймер по умолчанию' },
  { value: 'manual', label: 'Вручную', icon: '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>', desc: 'Учитель переключает вопросы' },
]

const STYLES = [
  { value: 'editorial', label: 'Editorial', icon: '<path d="M4 7V4h16v3"/><path d="M9 20h6"/><path d="M12 4v16"/>', desc: 'Светлый, шрифты с засечками' },
  { value: 'midnight', label: 'Midnight', icon: '<path d="M12 3a9 9 0 1 0 9 9"/><circle cx="12" cy="12" r="3"/>', desc: 'Тёмное стекло с индиго' },
  { value: 'brutalist', label: 'Brutalist', icon: '<rect x="3" y="3" width="18" height="18" rx="0"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/>', desc: 'Бежевый, красный, острые углы' },
  { value: 'neon', label: 'Neon', icon: '<circle cx="12" cy="12" r="8" fill="none"/><path d="M12 4v16M4 12h16" stroke-width="1"/>', desc: 'Тёмный, зелёное свечение' },
  { value: 'paper', label: 'Paper', icon: '<path d="M4 6h16M4 12h16M4 18h12"/><circle cx="18" cy="18" r="3"/>', desc: 'Тёплый бежевый, терракот' },
  { value: 'candy', label: 'Candy', icon: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>', desc: 'Розовый пастельный, игривый' },
  { value: 'ocean', label: 'Ocean', icon: '<path d="M2 12h20M2 12a10 10 0 0 1 10-10M2 12a10 10 0 0 0 10 10M22 12a10 10 0 0 0-10 10M22 12a10 10 0 0 0-10-10"/>', desc: 'Глубокий сине-бирюзовый' },
  { value: 'nord', label: 'Nord', icon: '<path d="M6 18h12M6 6h12M6 12h12"/><circle cx="12" cy="12" r="3"/>', desc: 'Скандинавский, морозная голубизна' },
  { value: 'ember', label: 'Ember', icon: '<path d="M12 2a10 10 0 1 0 10 10"/><path d="M12 6a6 6 0 1 0 6 6"/><circle cx="12" cy="12" r="3"/>', desc: 'Тёплый закат, янтарь и охра' },
  { value: 'lavender', label: 'Lavender', icon: '<path d="M12 2a12 12 0 0 0-8 20"/><path d="M12 2a12 12 0 0 1 8 20"/><circle cx="12" cy="12" r="4"/>', desc: 'Спокойный фиолетовый, лаванда' },
  { value: 'forest', label: 'Forest', icon: '<path d="M12 2L2 12h4v8h12v-8h4L12 2z"/><path d="M12 14v-4"/><circle cx="12" cy="16" r="1"/>', desc: 'Глубокий зелёный, сосновый бор' },
]

export function Settings({ onBack, onStyleChange, onDarkModeChange }: Props) {
  const [settings, setSettings] = useState<AppSettings | null>(null)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')
  const [showStyles, setShowStyles] = useState(false)
  const [appInfo, setAppInfo] = useState<{ version: string; channel: string } | null>(null)
  const [wifiLimit, setWifiLimit] = useState(32)
  const [wifiSaved, setWifiSaved] = useState(false)

  useEffect(() => {
    invoke<AppSettings>('get_settings').then(setSettings).catch(console.error)
    invoke<{ version: string; channel: string }>('get_app_info').then(setAppInfo).catch(() => {})
  }, [])

  const update = (patch: Partial<AppSettings>) => {
    if (!settings) return
    setSettings({ ...settings, ...patch })
    setSaved(false)
  }

  const handleWifiLimitSave = async () => {
    try {
      await invoke('set_wifi_limit', { limit: wifiLimit })
      setWifiSaved(true)
      setTimeout(() => setWifiSaved(false), 3000)
    } catch (e) {
      setError('' + e)
    }
  }

  const handleSave = async () => {
    if (!settings) return
    try {
      await invoke('save_settings', { settings })
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e) {
      setError('' + e)
    }
  }

  if (!settings) return <div className="settings-page"><div className="settings-loading">Загрузка...</div></div>

  return (
    <div className="settings-page">
      <div className="settings-header">
        <button className="btn btn-secondary" onClick={onBack}>← Назад</button>
        <h2>Настройки</h2>
        <div style={{ flex: 1 }} />
      </div>

      <div className="settings-body">
        <div className="settings-section">
          <h3>Режим по умолчанию</h3>
          <div className="settings-row">
            {MODES.map((m) => (
              <button
                key={m.value}
                className={`settings-card ${settings.default_mode === m.value ? 'selected' : ''}`}
                onClick={() => update({ default_mode: m.value })}
              >
                <span className="settings-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" dangerouslySetInnerHTML={{ __html: m.icon }} />
                </span>
                <span className="settings-card-title">{m.label}</span>
                <span className="settings-card-desc">{m.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <h3>Переключение вопросов</h3>
          <div className="settings-row">
            {ADVANCES.map((a) => (
              <button
                key={a.value}
                className={`settings-card ${settings.default_advance === a.value ? 'selected' : ''}`}
                onClick={() => update({ default_advance: a.value })}
              >
                <span className="settings-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" dangerouslySetInnerHTML={{ __html: a.icon }} />
                </span>
                <span className="settings-card-title">{a.label}</span>
                <span className="settings-card-desc">{a.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="settings-section">
          <button className="settings-collapse" onClick={() => setShowStyles(!showStyles)}>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16" style={{ transform: showStyles ? 'rotate(90deg)' : 'rotate(0deg)', transition: 'transform .2s' }}><polyline points="9 18 15 12 9 6"/></svg>
            <h3>Стили</h3>
            <span className="settings-count">{STYLES.length}</span>
          </button>
          {showStyles && (
            <>
              <div className="settings-row settings-themes">
                {STYLES.map((s) => (
                  <button
                    key={s.value}
                    className={`settings-card style-card style-card-${s.value} ${settings.style === s.value ? 'selected' : ''}`}
                    onClick={() => {
                      update({ style: s.value })
                      onStyleChange(s.value)
                      const newSettings = { ...settings, style: s.value }
                      invoke('save_settings', { settings: newSettings }).catch(() => {})
                    }}
                  >
                    <span className="settings-card-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24" dangerouslySetInnerHTML={{ __html: s.icon }} />
                    </span>
                    <span className="settings-card-title">{s.label}</span>
                    <span className="settings-card-desc">{s.desc}</span>
                    <span className="style-swatch" />
                  </button>
                ))}
              </div>
              <button
                className={`settings-card dark-toggle ${settings.dark_mode ? 'selected' : ''}`}
                onClick={() => {
                  const v = !settings.dark_mode
                  update({ dark_mode: v })
                  onDarkModeChange(v)
                  const ns = { ...settings, dark_mode: v }
                  invoke('save_settings', { settings: ns }).catch(() => {})
                }}
              >
                <span className="settings-card-icon">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24">
                    {settings.dark_mode
                      ? '<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>'
                      : '<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>'}
                  </svg>
                </span>
                <span className="settings-card-title">{settings.dark_mode ? 'Светлая тема' : 'Тёмная тема'}</span>
                <span className="settings-card-desc">{settings.dark_mode ? 'Переключить на светлую' : 'Переключить на тёмную'}</span>
              </button>
            </>
          )}
        </div>

        <div className="settings-section">
          <h3>Значения по умолчанию</h3>
          <div className="settings-defaults">
            <label>
              <span>Время на вопрос (сек)</span>
              <input
                type="number"
                min={5}
                max={300}
                value={settings.default_time_seconds}
                onChange={(e) => update({ default_time_seconds: Math.max(5, +e.target.value || 5) })}
              />
            </label>
            <label>
              <span>Баллы за вопрос</span>
              <input
                type="number"
                min={1}
                max={100}
                value={settings.default_points}
                onChange={(e) => update({ default_points: Math.max(1, +e.target.value || 1) })}
              />
            </label>
          </div>
          <label className="internet-check-settings">
            <input
              type="checkbox"
              checked={settings.internet_check}
              onChange={(e) => update({ internet_check: e.target.checked })}
            />
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="18" height="18"><circle cx="12" cy="12" r="10"/><line x1="2" y1="12" x2="22" y2="12"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/></svg>
              Обнаруживать мобильный интернет у учеников
          </label>
        </div>

        <div className="settings-section">
          <h3>Точка доступа Wi-Fi (если раздаете с ПК)</h3>
          <div className="settings-defaults" style={{ alignItems: 'flex-end', gap: '12px' }}>
            <label>
              <span>Максимум устройств</span>
              <input
                type="number"
                min={8}
                max={128}
                value={wifiLimit}
                onChange={(e) => setWifiLimit(Math.max(8, Math.min(128, +e.target.value || 32)))}
                style={{ width: '100px' }}
              />
            </label>
            <button className="btn btn-secondary" onClick={handleWifiLimitSave} style={{ marginBottom: 4, transition: 'all 0.2s', background: wifiSaved ? 'var(--primary)' : undefined, color: wifiSaved ? '#fff' : undefined, borderColor: wifiSaved ? 'var(--primary)' : undefined }}>
              {wifiSaved ? '✓ Успешно применено' : 'Применить (нужны права админа)'}
            </button>
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 8 }}>
            Снимает ограничение Windows на 8 устройств. После применения переподключите точку доступа.
          </p>
        </div>

        {error && <div className="settings-error">{error}</div>}

        <div className="settings-actions">
          <button className="btn btn-primary" onClick={handleSave}>
            {saved ? '✓ Сохранено' : 'Сохранить настройки'}
          </button>
        </div>

        <div className="settings-version">
          {appInfo ? `v${appInfo.version} — ${appInfo.channel === 'dev' ? 'dev' : 'stable'}` : ''}
        </div>
      </div>
    </div>
  )
}
