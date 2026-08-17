import { useState } from 'react'

type Q = { text: string; answer: string }

export function CreateOwnQuiz({ onBack }: { onBack: () => void }) {
  const [title, setTitle] = useState('')
  const [questions, setQuestions] = useState<Q[]>([{ text: '', answer: '' }])
  const [phase, setPhase] = useState<'edit' | 'play' | 'end'>('edit')
  const [idx, setIdx] = useState(0)
  const [input, setInput] = useState('')
  const [results, setResults] = useState<{ correct: boolean; your: string; right: string }[]>([])
  const [showResult, setShowResult] = useState(false)

  function addQ() { setQuestions([...questions, { text: '', answer: '' }]) }
  function delQ(i: number) { if (questions.length > 1) setQuestions(questions.filter((_, j) => j !== i)) }
  function setQ(i: number, f: keyof Q, v: string) {
    const next = [...questions]
    next[i] = { ...next[i], [f]: v }
    setQuestions(next)
  }

  function startPlay() {
    setPhase('play')
    setIdx(0)
    setInput('')
    setResults([])
    setShowResult(false)
  }

  function submitA() {
    const right = questions[idx].answer
    const correct = input.trim().toLowerCase() === right.trim().toLowerCase()
    setResults([...results, { correct, your: input, right }])
    setShowResult(true)
  }

  function nextQ() {
    if (idx + 1 < questions.length) {
      setIdx(idx + 1)
      setInput('')
      setShowResult(false)
    } else {
      setPhase('end')
    }
  }

  const score = results.filter(r => r.correct).length

  if (phase === 'end') {
    return (
      <div className="game-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 24, padding: 32, flex: 1 }}>
        <div className="glass-card" style={{ maxWidth: 420, width: '100%', padding: 32, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 16 }}>
          <div style={{ fontSize: 48 }}>🎙️</div>
          <h2>{title || 'Я — ведущий'}</h2>
          <div style={{ fontSize: 48, fontWeight: 900, color: 'var(--success)' }}>{score} / {results.length}</div>
          <div style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 8, marginTop: 8 }}>
            {results.map((r, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', fontSize: 13 }}>
                <span>{r.correct ? '✅' : '❌'}</span>
                <span style={{ flex: 1 }}>{r.right}</span>
                {!r.correct && <span style={{ color: 'var(--danger)', fontSize: 12 }}>Вы: {r.your}</span>}
              </div>
            ))}
          </div>
          <button className="btn btn-primary" onClick={onBack} style={{ width: '100%' }}>← В каталог</button>
        </div>
      </div>
    )
  }

  if (phase === 'play') {
    const q = questions[idx]
    return (
      <div className="game-screen" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 24, flex: 1 }}>
        <div className="glass-card" style={{ maxWidth: 520, width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <button className="btn btn-secondary" onClick={() => setPhase('edit')} style={{ padding: '6px 14px', fontSize: 13 }}>←</button>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>Вопрос {idx + 1}/{questions.length}</span>
            <span style={{ fontSize: 14, color: 'var(--text-secondary)' }}>✅ {score}</span>
          </div>
          <div style={{ fontSize: 'clamp(18px,2.5vw,26px)', fontWeight: 700, textAlign: 'center', padding: '20px 16px', background: 'var(--bg-input)', borderRadius: 'var(--radius)', lineHeight: 1.5 }}>
            {q.text}
          </div>
          {!showResult ? (
            <>
              <input value={input} onChange={e => setInput(e.target.value)} placeholder="Ваш ответ..." autoFocus
                onKeyDown={e => e.key === 'Enter' && input.trim() && submitA()}
                style={{ width: '100%', padding: '14px 18px', background: 'var(--bg-input)', border: '2px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 20, textAlign: 'center', fontFamily: 'inherit' }} />
              <button className="btn btn-primary" onClick={submitA} disabled={!input.trim()} style={{ width: '100%' }}>📤 Ответить</button>
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 48 }}>{results[results.length - 1].correct ? '✅' : '❌'}</div>
              <div style={{ fontSize: 22, fontWeight: 700 }}>{results[results.length - 1].correct ? 'Верно!' : 'Неверно'}</div>
              <div style={{ color: 'var(--text-secondary)', textAlign: 'center' }}>
                Правильный ответ: <strong style={{ color: 'var(--success)' }}>{results[results.length - 1].right}</strong>
              </div>
              <button className="btn btn-primary" onClick={nextQ} style={{ width: '100%', marginTop: 8 }}>
                {idx + 1 < questions.length ? '→ Далее' : '🏁 Результаты'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // Edit mode
  return (
    <div className="game-screen" style={{ display: 'flex', flexDirection: 'column', padding: 24, flex: 1 }}>
      <div className="glass-card" style={{ maxWidth: 600, width: '100%', padding: 28, display: 'flex', flexDirection: 'column', gap: 16, margin: '0 auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <button className="btn btn-secondary" onClick={onBack} style={{ padding: '6px 14px', fontSize: 13 }}>←</button>
          <h2 style={{ margin: 0 }}>🎙️ Я — ведущий</h2>
          <div />
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-secondary)', textAlign: 'center' }}>Придумайте свои вопросы и ответы</p>
        <div className="input-group">
          <label>Название игры</label>
          <input value={title} onChange={e => setTitle(e.target.value)} placeholder="Моя викторина" maxLength={50}
            style={{ width: '100%', padding: '12px 16px', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 16, fontFamily: 'inherit' }} />
        </div>
        <div style={{ height: 1, background: 'var(--border)', width: '100%' }} />
        {questions.map((q, i) => (
          <div key={i} style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: 16, background: 'var(--bg-input)', borderRadius: 'var(--radius)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <strong style={{ fontSize: 14 }}>#{i + 1}</strong>
              {questions.length > 1 && (
                <button className="btn" onClick={() => delQ(i)} style={{ padding: '2px 10px', fontSize: 12, color: 'var(--danger)' }}>✕</button>
              )}
            </div>
            <input value={q.text} onChange={e => setQ(i, 'text', e.target.value)} placeholder="Текст вопроса..."
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--text)', fontSize: 14, fontFamily: 'inherit' }} />
            <input value={q.answer} onChange={e => setQ(i, 'answer', e.target.value)} placeholder="Правильный ответ..."
              style={{ width: '100%', padding: '10px 14px', background: 'var(--bg-card)', border: '1px solid var(--border)', borderRadius: 'var(--radius)', color: 'var(--success)', fontSize: 14, fontFamily: 'inherit' }} />
          </div>
        ))}
        <button className="btn btn-secondary" onClick={addQ} style={{ width: '100%' }}>+ Добавить вопрос</button>
        <button className="btn btn-primary" onClick={startPlay} disabled={questions.some(q => !q.text.trim() || !q.answer.trim()) || questions.length === 0}
          style={{ width: '100%', fontSize: 16, padding: '14px 24px' }}>
          ▶ Играть ({questions.length} вопросов)
        </button>
      </div>
    </div>
  )
}

