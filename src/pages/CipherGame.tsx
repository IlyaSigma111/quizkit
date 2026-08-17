import { useState, useMemo } from 'react'

const RU = 'абвгдеёжзийклмнопрстуфхцчшщъыьэюя'

function encrypt(t: string): string {
  return t.split('').map(c => {
    const i = RU.indexOf(c.toLowerCase())
    return i >= 0 ? (i + 1).toString().padStart(2, '0') : c === ' ' ? '  ' : c
  }).join(' ')
}

function getAnswer(q: any): string {
  return q.answer || (q.answers || []).find((a: any) => a.is_correct)?.text || ''
}

type Props = {
  template: { title: string; emoji?: string; questions: any[] }
  onBack: () => void
}

export function CipherGame({ template, onBack }: Props) {
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [results, setResults] = useState<{ correct: boolean; your: string; right: string }[]>([])
  const [phase, setPhase] = useState<'answer' | 'result'>('answer')

  const q = template.questions[idx]
  const isDone = idx >= template.questions.length
  const score = results.filter(r => r.correct).length

  const encrypted = useMemo(() => q ? encrypt(q.text) : '', [q])

  function submit() {
    const right = getAnswer(q)
    const correct = input.trim().toLowerCase() === right.trim().toLowerCase()
    setResults([...results, { correct, your: input, right }])
    setPhase('result')
  }

  function next() {
    setPhase('answer')
    setInput('')
    setIdx(idx + 1)
  }

  if (isDone) {
    return (
      <div className="game-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32, flex: 1 }}>
        <div className="glass-card" style={{ maxWidth: 420, width: '100%', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🔢</div>
          <h2>Шифр — результаты</h2>
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--success)' }}>{score} / {results.length}</div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                <span>{r.correct ? '✅' : '❌'}</span>
                <span style={{ flex: 1, color: 'var(--text-secondary)' }}>{r.right}</span>
                {!r.correct && <span style={{ color: 'var(--danger)', fontSize: 12 }}>Вы: {r.your}</span>}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={onBack} style={{ width: '100%' }}>← В каталог</button>
        </div>
      </div>
    )
  }

  return (
    <div className="game-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, flex: 1 }}>
      <div className="glass-card" style={{ maxWidth: 520, width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ padding: '6px 14px', fontSize: 13 }}>←</button>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Вопрос {idx + 1}/{template.questions.length}</span>
          <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>✅ {score}</span>
        </div>
        <div style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>Расшифруйте вопрос (каждая буква = число):</div>
        <div className="cipher-text" style={{ fontFamily: 'monospace', fontSize: 'clamp(18px,2.5vw,28px)', fontWeight: 700, textAlign: 'center', padding: '20px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', lineHeight: 1.6, letterSpacing: 2 }}>
          {encrypted}
        </div>
        {phase === 'answer' ? (
          <>
            <input className="cipher-input" value={input} onChange={e => setInput(e.target.value)} placeholder="Ваш ответ..." autoFocus
              onKeyDown={e => e.key === 'Enter' && input.trim() && submit()}
              style={{ width: '100%', padding: '14px 18px', background: 'var(--bg-input)', border: '2px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 20, textAlign: 'center', fontFamily: 'inherit' }} />
            <button className="btn btn-primary" onClick={submit} disabled={!input.trim()} style={{ width: '100%' }}>📤 Ответить</button>
          </>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <div style={{ fontSize: 48 }}>{results[results.length - 1].correct ? '✅' : '❌'}</div>
            <div style={{ fontSize: 22, fontWeight: 700 }}>{results[results.length - 1].correct ? 'Верно!' : 'Неверно'}</div>
            <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
              Правильный ответ: <strong style={{ color: 'var(--success)' }}>{results[results.length - 1].right}</strong>
            </div>
            <button className="btn btn-primary" onClick={next} style={{ width: '100%', marginTop: 8 }}>
              {idx + 1 < template.questions.length ? '→ Далее' : '🏁 Результаты'}
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
