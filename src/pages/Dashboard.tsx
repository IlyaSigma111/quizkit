import { useState, useEffect, useRef, useCallback } from 'react'
import type { Quiz, GameSession } from '../App'
import { invoke } from '@tauri-apps/api/core'



type Props = {
  onEditQuiz: (id: string) => void
  onStartGame: (pin: string) => void
  onCatalog: () => void
}

const TEMPLATE_JSON = `{
  "title": "Название квиза",
  "description": "Описание (необязательно)",
  "questions": [
    {
      "text": "Текст вопроса",
      "time_seconds": 30,
      "points": 10,
      "answers": [
        { "text": "Правильный ответ", "is_correct": true },
        { "text": "Неправильный ответ", "is_correct": false },
        { "text": "Неправильный ответ", "is_correct": false },
        { "text": "Неправильный ответ", "is_correct": false }
      ]
    }
  ]
}`

interface HolidayTemplate {
  title: string
  description: string
  emoji: string
  type: 'quiz' | 'truefalse'
  questions: Array<{
    text: string
    time_seconds: number
    points: number
    answers: Array<{ text: string; is_correct: boolean }>
  }>
}

const HOLIDAY_TEMPLATES: HolidayTemplate[] = [
  {
    title: 'Новый год',
    description: 'Традиции Нового года со всего мира',
    emoji: '\u{1F384}',
    type: 'quiz',
    questions: [
      { text: 'В какой стране впервые начали украшать ёлку на Новый год?', time_seconds: 20, points: 10, answers: [{ text: 'Германия', is_correct: true }, { text: 'Россия', is_correct: false }, { text: 'Франция', is_correct: false }, { text: 'Италия', is_correct: false }] },
      { text: 'Какой год считается годом Змеи по восточному календарю?', time_seconds: 20, points: 10, answers: [{ text: '2025', is_correct: true }, { text: '2024', is_correct: false }, { text: '2026', is_correct: false }, { text: '2023', is_correct: false }] },
      { text: 'В какой стране на Новый год принято разбивать посуду?', time_seconds: 20, points: 10, answers: [{ text: 'Дания', is_correct: true }, { text: 'Испания', is_correct: false }, { text: 'Япония', is_correct: false }, { text: 'Бразилия', is_correct: false }] },
      { text: 'Что символизирует фейерверк в новогоднюю ночь?', time_seconds: 20, points: 10, answers: [{ text: 'Отпугивание злых духов', is_correct: true }, { text: 'Красоту', is_correct: false }, { text: 'Богатство', is_correct: false }, { text: 'Долголетие', is_correct: false }] },
      { text: 'В какой стране Дед Мороз называется Йоулупукки?', time_seconds: 20, points: 10, answers: [{ text: 'Финляндия', is_correct: true }, { text: 'Швеция', is_correct: false }, { text: 'Норвегия', is_correct: false }, { text: 'Исландия', is_correct: false }] },
    ]
  },
  {
    title: 'Рождество',
    description: 'Интересные факты о Рождестве',
    emoji: '\u{2B50}',
    type: 'truefalse',
    questions: [
      { text: 'Рождество празднуется 25 декабря во всех христианских странах.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: false }, { text: 'Неверно', is_correct: true }] },
      { text: 'Традиция ставить рождественскую ёлку пришла из Германии.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'В Австралии Рождество отмечают летом.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Слово «Рождество» происходит от латинского «nativitas».', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'В Исландии 13 рождественских Санта-Клаусов.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
    ]
  },
  {
    title: 'День Святого Валентина',
    description: 'История и традиции Дня всех влюблённых',
    emoji: '\u{1F498}',
    type: 'quiz',
    questions: [
      { text: 'В каком веке жил Святой Валентин?', time_seconds: 20, points: 10, answers: [{ text: 'III век', is_correct: true }, { text: 'V век', is_correct: false }, { text: 'X век', is_correct: false }, { text: 'XII век', is_correct: false }] },
      { text: 'Какая страна первой начала массово выпускать валентинки?', time_seconds: 20, points: 10, answers: [{ text: 'США', is_correct: true }, { text: 'Франция', is_correct: false }, { text: 'Англия', is_correct: false }, { text: 'Италия', is_correct: false }] },
      { text: 'Сколько валентинок отправляется в мире ежегодно?', time_seconds: 20, points: 10, answers: [{ text: 'Около 1 миллиарда', is_correct: true }, { text: 'Около 100 миллионов', is_correct: false }, { text: 'Около 500 миллионов', is_correct: false }, { text: 'Около 2 миллиардов', is_correct: false }] },
      { text: 'В какой стране на 14 февраля дарят не только валентинки, но и подарки друзьям?', time_seconds: 20, points: 10, answers: [{ text: 'Япония', is_correct: true }, { text: 'Китай', is_correct: false }, { text: 'Корея', is_correct: false }, { text: 'Тайланд', is_correct: false }] },
      { text: 'Какого цвета традиционно украшения на День Святого Валентина?', time_seconds: 20, points: 10, answers: [{ text: 'Красный и белый', is_correct: true }, { text: 'Розовый и фиолетовый', is_correct: false }, { text: 'Красный и золотой', is_correct: false }, { text: 'Белый и серебряный', is_correct: false }] },
    ]
  },
  {
    title: '8 Марта',
    description: 'История Международного женского дня',
    emoji: '\u{1F338}',
    type: 'truefalse',
    questions: [
      { text: '8 Марта изначально был днём борьбы за права женщин.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Первый Международный женский день отметили в 1857 году.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: false }, { text: 'Неверно', is_correct: true }] },
      { text: 'Клара Цеткин предложила учредить Международный женский день.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: '8 Марта является выходным днём в более чем 30 странах мира.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Символом 8 Марта является тюльпан.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
    ]
  },
  {
    title: 'День космонавтики',
    description: 'Освоение космоса и великие открытия',
    emoji: '\u{1F680}',
    type: 'quiz',
    questions: [
      { text: 'Кто был первым человеком в космосе?', time_seconds: 20, points: 10, answers: [{ text: 'Юрий Гагарин', is_correct: true }, { text: 'Нил Армстронг', is_correct: false }, { text: 'Валентина Терешкова', is_correct: false }, { text: 'Алексей Леонов', is_correct: false }] },
      { text: 'В каком году состоялся первый полёт человека в космос?', time_seconds: 20, points: 10, answers: [{ text: '1961', is_correct: true }, { text: '1957', is_correct: false }, { text: '1965', is_correct: false }, { text: '1969', is_correct: false }] },
      { text: 'Сколько минут длился полёт Гагарина?', time_seconds: 20, points: 10, answers: [{ text: '108 минут', is_correct: true }, { text: '90 минут', is_correct: false }, { text: '120 минут', is_correct: false }, { text: '150 минут', is_correct: false }] },
      { text: 'Как назывался корабль Гагарина?', time_seconds: 20, points: 10, answers: [{ text: 'Восток-1', is_correct: true }, { text: 'Союз-1', is_correct: false }, { text: 'Восход-1', is_correct: false }, { text: 'Спутник-1', is_correct: false }] },
      { text: 'Какая женщина первой побывала в космосе?', time_seconds: 20, points: 10, answers: [{ text: 'Валентина Терешкова', is_correct: true }, { text: 'Светлана Савицкая', is_correct: false }, { text: 'Пегги Уитсон', is_correct: false }, { text: 'Салли Райд', is_correct: false }] },
    ]
  },
  {
    title: 'День Победы',
    description: 'Великая Отечественная война в фактах',
    emoji: '\u{1F3C5}',
    type: 'truefalse',
    questions: [
      { text: 'Вторая мировая война началась в 1939 году.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Блокада Ленинграда длилась 872 дня.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Битва за Москву произошла в 1943 году.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: false }, { text: 'Неверно', is_correct: true }] },
      { text: 'Георгиевская лента — символ Дня Победы.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Парад Победы состоялся 24 июня 1945 года.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
    ]
  },
  {
    title: '1 Сентября — День знаний',
    description: 'Школа, учёба и интересные факты об образовании',
    emoji: '\u{1F4DA}',
    type: 'quiz',
    questions: [
      { text: 'В какой стране появилась первая в мире школа?', time_seconds: 20, points: 10, answers: [{ text: 'Древний Египет', is_correct: true }, { text: 'Древняя Греция', is_correct: false }, { text: 'Древний Китай', is_correct: false }, { text: 'Древний Рим', is_correct: false }] },
      { text: 'Сколько лет длится среднее образование в России?', time_seconds: 20, points: 10, answers: [{ text: '11 лет', is_correct: true }, { text: '10 лет', is_correct: false }, { text: '12 лет', is_correct: false }, { text: '9 лет', is_correct: false }] },
      { text: 'Какая страна тратит больше всего на образование?', time_seconds: 20, points: 10, answers: [{ text: 'Норвегия', is_correct: true }, { text: 'США', is_correct: false }, { text: 'Швейцария', is_correct: false }, { text: 'Финляндия', is_correct: false }] },
      { text: 'В какой стране самая длинная учебная неделя?', time_seconds: 20, points: 10, answers: [{ text: 'Япония', is_correct: true }, { text: 'Китай', is_correct: false }, { text: 'Корея', is_correct: false }, { text: 'Израиль', is_correct: false }] },
      { text: 'Какой предмет изучают во всех школах мира?', time_seconds: 20, points: 10, answers: [{ text: 'Математика', is_correct: true }, { text: 'История', is_correct: false }, { text: 'Литература', is_correct: false }, { text: 'География', is_correct: false }] },
    ]
  },
  {
    title: 'Хэллоуин',
    description: 'Мистические традиции и история Хэллоуина',
    emoji: '\u{1F383}',
    type: 'truefalse',
    questions: [
      { text: 'Хэллоуин берёт начало от кельтского праздника Самайн.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Тыква — единственный овощ, из которого делают светильники на Хэллоуин.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: false }, { text: 'Неверно', is_correct: true }] },
      { text: 'Традиция «кошелёк или жизнь» появилась в США в XX веке.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Оранжевый и чёрный — традиционные цвета Хэллоуина.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: true }, { text: 'Неверно', is_correct: false }] },
      { text: 'Хэллоуин отмечают 31 октября во всём мире одинаково.', time_seconds: 15, points: 10, answers: [{ text: 'Верно', is_correct: false }, { text: 'Неверно', is_correct: true }] },
    ]
  },
]

export function Dashboard({ onEditQuiz, onStartGame, onCatalog }: Props) {
  const [quizzes, setQuizzes] = useState<Quiz[]>([])
  const [search, setSearch] = useState('')
  const [showCreate, setShowCreate] = useState(false)
  const [newTitle, setNewTitle] = useState('')
  const [newDesc, setNewDesc] = useState('')
  const [showTemplate, setShowTemplate] = useState(false)
  const [showHolidayPicker, setShowHolidayPicker] = useState(false)
  const [remoteTemplates, setRemoteTemplates] = useState<HolidayTemplate[] | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const fetchTemplates = useCallback(async () => {
    try {
      const res = await fetch('/templates.json')
      if (!res.ok) return
      const data = await res.json()
      if (data.templates) {
        setRemoteTemplates(data.templates)
      }
    } catch {
      // offline — keep current templates
    }
  }, [])

  useEffect(() => {
    fetchTemplates()
  }, [fetchTemplates])

  const templates = remoteTemplates || HOLIDAY_TEMPLATES

  const loadQuizzes = () => {
    invoke<Quiz[]>('get_quizzes').then(setQuizzes).catch(console.error)
  }

  useEffect(() => { loadQuizzes() }, [])

  const handleCreate = () => {
    if (!newTitle.trim()) return
    invoke<Quiz>('create_quiz', { title: newTitle, description: newDesc })
      .then((quiz) => {
        setQuizzes((prev) => [quiz, ...prev])
        setShowCreate(false)
        setNewTitle('')
        setNewDesc('')
        onEditQuiz(quiz.id)
      })
      .catch(console.error)
  }

  const handleImport = () => {
    fileRef.current?.click()
  }

  const handleCreateFromTemplate = (t: HolidayTemplate) => {
    const id = crypto.randomUUID?.() || Math.random().toString(36).slice(2)
    const colors = ['#FF4444','#4488FF','#FFBB33','#44CC44']
    const shapes = ['△','◇','○','☆']
    const now = new Date().toISOString()
    const quiz: Quiz = {
      id, title: t.title, description: t.description, created_at: now,
      tags: [t.type === 'truefalse' ? 'Правда и Ложь' : 'Викторина'],
      questions: t.questions.map((q, qi) => ({
        id: crypto.randomUUID?.() || id + '-q' + qi,
        text: q.text,
        time_seconds: q.time_seconds,
        points: q.points,
        answers: q.answers.map((a, ai) => ({
          id: crypto.randomUUID?.() || id + '-q' + qi + '-a' + ai,
          text: a.text,
          is_correct: a.is_correct,
          color: colors[ai] || '#666',
          shape: shapes[ai] || '●',
        }))
      }))
    }
    invoke<Quiz>('save_quiz', { quiz })
      .then(() => {
        setQuizzes((prev) => [quiz, ...prev])
        setShowHolidayPicker(false)
        onEditQuiz(quiz.id)
      })
      .catch(console.error)
  }

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const reader = new FileReader()
    reader.onload = async (ev) => {
      try {
        const raw = JSON.parse(ev.target?.result as string)
        const title = raw.title || 'Импортированный квиз'
        const description = raw.description || ''
        const isServerFormat = raw.questions?.length && typeof raw.questions[0].question === 'string'
        const questions = (raw.questions || []).map((q: any, idx: number) => {
          const answers = isServerFormat
            ? (q.answers as string[]).map((a: string, ai: number) => ({
                id: `a-${Date.now()}-${idx}-${ai}`,
                text: a,
                is_correct: ai === q.correct,
                color: ['#FF4444', '#4488FF', '#FFBB33', '#44CC44'][ai] || '#666',
                shape: ['△', '◇', '○', '☆'][ai] || '?',
              }))
            : (q.answers || []).map((a: any, ai: number) => ({
                id: `a-${Date.now()}-${idx}-${ai}`,
                text: a.text || `Ответ ${ai + 1}`,
                is_correct: !!a.is_correct,
                color: ['#FF4444', '#4488FF', '#FFBB33', '#44CC44'][ai] || '#666',
                shape: ['△', '◇', '○', '☆'][ai] || '?',
              }))
          return {
            id: `q-${Date.now()}-${idx}`,
            text: isServerFormat ? q.question : (q.text || `Вопрос ${idx + 1}`),
            time_seconds: q.time_seconds || 30,
            points: q.points || 10,
            answers,
          }
        })
        const quiz = await invoke<Quiz>('create_quiz', { title, description })
        const saved = { ...quiz, questions }
        await invoke('save_quiz', { quiz: saved })
        loadQuizzes()
      } catch (err) {
        alert('Ошибка импорта: ' + err)
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  const handleDelete = (id: string) => {
    if (!confirm('Удалить квиз?')) return
    invoke('delete_quiz', { id }).then(loadQuizzes).catch(console.error)
  }

  interface ModePickerState {
    quizId: string
    step: 'type' | 'advance'
    gameType?: 'live'
  }
  const [modePicker, setModePicker] = useState<ModePickerState | null>(null)

  const handleStart = async (quizId: string, mode: string, advance: string) => {
    try {
      const session = await invoke<GameSession>('start_game', { quizId, mode, advance })
      setModePicker(null)
      onStartGame(session.pin)
    } catch (e) {
      alert('Ошибка: ' + e)
    }
  }

  const filtered = quizzes.filter((q) =>
    q.title.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="dashboard">
      <div className="dashboard-top">
        <div className="search-bar">
          <input
            type="text"
            placeholder="Поиск квизов..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
        </div>
        <button className="btn btn-primary" onClick={() => setShowCreate(true)}>
          + Создать квиз
        </button>
        <button className="btn btn-secondary" onClick={onCatalog}>
          📚 Каталог
        </button>
        <button className="btn btn-secondary" onClick={handleImport}>
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="16" height="16"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
          JSON
        </button>
        <input ref={fileRef} type="file" accept=".json" style={{ display: 'none' }} onChange={handleFileChange} />
      </div>

      {showCreate && (
        <div className="create-form">
          <input
            type="text"
            placeholder="Название квиза"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            autoFocus
          />
          <input
            type="text"
            placeholder="Описание (необязательно)"
            value={newDesc}
            onChange={(e) => setNewDesc(e.target.value)}
          />
          <div className="create-actions">
            <button className="btn btn-primary" onClick={handleCreate}>Создать</button>
            <button className="btn btn-secondary" onClick={() => setShowCreate(false)}>Отмена</button>
            <button className="btn btn-secondary" onClick={() => setShowHolidayPicker(true)} style={{ marginLeft: 'auto' }}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M12 2l3 7h7l-5 5 2 8-7-4-7 4 2-8-5-5h7z"/></svg>
              Готовые шаблоны
            </button>
            <button className="btn btn-secondary" onClick={() => setShowTemplate(true)}>
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
              Формат
            </button>
          </div>
        </div>
      )}

      <div className="quiz-grid">
        {filtered.map((quiz) => (
          <div key={quiz.id} className="quiz-card">
            <div className="quiz-card-header">
              <h3>{quiz.title}</h3>
              <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                <span className="question-count">
                  {quiz.questions.length} вопросов
                </span>
                {(() => {
                  const q = quiz as Quiz
                  const tags = q.tags || []
                  if (tags.length > 0) {
                    return tags.map(t => {
                      const cls = t === 'Правда и Ложь' ? 'tag-tf' : t === 'Викторина' ? 'tag-quiz' : 'tag-test'
                      return <span className={`tag ${cls}`} key={t}>{t}</span>
                    })
                  }
                  const n = quiz.questions[0]?.answers?.length
                  if (n === 2) return <span className="quiz-tag">Правда или Ложь</span>
                  if (n === 4) return <span className="quiz-tag">Викторина</span>
                  return null
                })()}
              </div>
            </div>
            {quiz.description && <p className="quiz-desc">{quiz.description}</p>}
            <div className="quiz-card-actions">
              <button className="btn btn-play" onClick={() => {
                const q = quiz as Quiz
                const tags = q.tags || []
                if (tags.includes('Проверочная работа')) {
                  handleStart(quiz.id, 'test', 'auto')
                } else if (tags.includes('Викторина') || tags.includes('Правда и Ложь')) {
                  setModePicker({ quizId: quiz.id, step: 'advance', gameType: 'live' })
                } else {
                  setModePicker({ quizId: quiz.id, step: 'type' })
                }
              }}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                Играть
              </button>
              <button className="btn btn-secondary" onClick={() => onEditQuiz(quiz.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
                Править
              </button>
              <button className="btn btn-danger" onClick={() => handleDelete(quiz.id)}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                Удалить
              </button>
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="empty-state">
            <p>Квизов пока нет. Создайте первый!</p>
          </div>
        )}
      </div>

      {modePicker && (
        <div className="modal-overlay" onClick={() => setModePicker(null)}>
          <div className="mode-picker" onClick={(e) => e.stopPropagation()}>
            {modePicker.step === 'type' ? (
              <>
                <h3>Выберите формат</h3>
                <div className="mode-options">
                  <button className="mode-option" onClick={() => handleStart(modePicker.quizId, 'test', 'auto')}>
                    <span className="mode-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    </span>
                    <span className="mode-title">Проверочная работа</span>
                    <span className="mode-desc">Каждый ученик отвечает в своём темпе</span>
                  </button>
                  <button className="mode-option" onClick={() => setModePicker({ ...modePicker, step: 'advance', gameType: 'live' })}>
                    <span className="mode-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </span>
                    <span className="mode-title">Викторина</span>
                    <span className="mode-desc">△◇○☆ — 4 варианта ответа</span>
                  </button>
                  <button className="mode-option" onClick={() => setModePicker({ ...modePicker, step: 'advance', gameType: 'live' })}>
                    <span className="mode-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="10"/></svg>
                    </span>
                    <span className="mode-title">Правда и Ложь</span>
                    <span className="mode-desc">✓✗ — 2 варианта ответа</span>
                  </button>
                </div>
                <button className="btn btn-secondary" onClick={() => setModePicker(null)}>Отмена</button>
              </>
            ) : (
              <>
                <h3>{modePicker.gameType === 'live' ? 'Викторина / Правда и Ложь' : ''}</h3>
                <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 4 }}>
                  Режим перехода между вопросами
                </p>
                <div className="mode-options">
                  <button className="mode-option" onClick={() => handleStart(modePicker.quizId, 'live', 'auto')}>
                    <span className="mode-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><polygon points="5 3 19 12 5 21 5 3"/></svg>
                    </span>
                    <span className="mode-title">Автоматически</span>
                    <span className="mode-desc">Таймер на каждый вопрос</span>
                  </button>
                  <button className="mode-option" onClick={() => handleStart(modePicker.quizId, 'live', 'manual')}>
                    <span className="mode-icon">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="24" height="24"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                    </span>
                    <span className="mode-title">Вручную</span>
                    <span className="mode-desc">Учитель сам листает вопросы</span>
                  </button>
                </div>
                <div className="create-actions" style={{ width: '100%' }}>
                  <button className="btn btn-secondary" onClick={() => setModePicker({ ...modePicker, step: 'type' })}>← Назад</button>
                  <button className="btn btn-secondary" onClick={() => setModePicker(null)}>Отмена</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {showTemplate && (
        <div className="modal-overlay" onClick={() => setShowTemplate(false)}>
          <div className="mode-picker" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 560 }}>
            <h3>Формат JSON для импорта</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center' }}>
              Создай .json файл с такой структурой и импортируй через кнопку «JSON»
            </p>
            <pre style={{
              width: '100%', padding: 16, background: 'var(--bg-input)',
              borderRadius: 'var(--radius)', fontSize: 12, lineHeight: 1.5,
              overflow: 'auto', maxHeight: 360, color: 'var(--text)',
              textAlign: 'left', whiteSpace: 'pre', fontFamily: 'monospace'
            }}>{TEMPLATE_JSON}</pre>
            <div style={{ display: 'flex', gap: 8, width: '100%' }}>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => {
                navigator.clipboard.writeText(TEMPLATE_JSON)
                alert('Шаблон скопирован!')
              }}>Копировать</button>
              <button className="btn btn-secondary" style={{ flex: 1 }} onClick={() => setShowTemplate(false)}>Закрыть</button>
            </div>
          </div>
        </div>
      )}

      {showHolidayPicker && (
        <div className="modal-overlay" onClick={() => setShowHolidayPicker(false)}>
          <div className="mode-picker" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 580 }}>
            <h3>Готовые шаблоны квизов</h3>
            <p style={{ fontSize: 13, color: 'var(--text-secondary)', textAlign: 'center', marginBottom: 4 }}>
              Выберите готовый квиз к празднику — он сразу откроется в редакторе
            </p>
            <div className="holiday-grid">
              {templates.map((t, idx) => (
                <button key={idx} className="holiday-card" onClick={() => handleCreateFromTemplate(t)}>
                  <span className="holiday-emoji">{t.emoji}</span>
                  <span className="holiday-title">{t.title}</span>
                  <span className="holiday-desc">{t.description}</span>
                  <span className={`holiday-type ${t.type === 'truefalse' ? 'holiday-type--tf' : ''}`}>
                    {t.type === 'truefalse' ? '✓✗ Правда/Ложь' : '△◇ Викторина'}
                  </span>
                </button>
              ))}
            </div>
            <button className="btn btn-secondary" onClick={() => setShowHolidayPicker(false)}>Закрыть</button>
          </div>
        </div>
      )}
    </div>
  )
}
