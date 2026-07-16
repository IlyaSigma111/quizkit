import { useState, useEffect, useMemo } from 'react'

type CatalogQuestion = {
  text: string
  points: number
  answers: Array<{ text: string; is_correct: boolean }>
}

type CatalogItem = {
  id: string
  title: string
  description: string
  emoji: string
  tag: string
  category: string
  total_time_seconds: number
  questions?: CatalogQuestion[]
}

type Props = {
  onImport: (title: string, description: string, questions: CatalogQuestion[], tag: string) => void
  onBack: () => void
  onPlayCipher?: (template: CatalogItem) => void
  onPlayCreateOwn?: () => void
}

const CATEGORIES = ['Все', 'Математика', 'Русский язык', 'История', 'География', 'Биология', 'Физика', 'Химия', 'Литература', 'Английский язык', 'Праздники', 'Экология', 'Культура и искусство', 'Кино', 'Спорт', 'Музыка', 'Общие знания', 'Правда и Ложь']
const TAGS = ['Все', 'Проверочная работа', 'Викторина', 'Правда и Ложь']

const CATEGORY_EMOJIS: Record<string, string> = {
  'Математика': '🔢', 'Русский язык': '📖', 'История': '🏛️', 'География': '🌍',
  'Биология': '🧬', 'Физика': '⚡', 'Химия': '🧪', 'Литература': '📚',
  'Английский язык': '🇬🇧', 'Праздники': '🎉', 'Экология': '🌱',
  'Культура и искусство': '🎭', 'Кино': '🎬', 'Спорт': '⚽', 'Музыка': '🎵',
  'Общие знания': '🧠', 'Правда и Ложь': '🎲',
}

function loadFavorites(): Set<string> {
  try { return new Set(JSON.parse(localStorage.getItem('catalogFavorites') || '[]')) } catch { return new Set() }
}
function saveFavorites(fav: Set<string>) {
  localStorage.setItem('catalogFavorites', JSON.stringify([...fav]))
}

export function QuizCatalog({ onImport, onBack, onPlayCipher, onPlayCreateOwn }: Props) {
  const [items, setItems] = useState<CatalogItem[]>([])
  const [search, setSearch] = useState('')
  const [catFilter, setCatFilter] = useState('Все')
  const [tagFilter, setTagFilter] = useState('Все')
  const [favorites, setFavorites] = useState<Set<string>>(loadFavorites)
  const [showFavOnly, setShowFavOnly] = useState(false)
  const [offset, setOffset] = useState(0)
  const PAGE = 40

  useEffect(() => {
    fetch('/templates.json')
      .then(r => r.json())
      .then(d => setItems(d.templates || []))
      .catch(() => {})
  }, [])

  useEffect(() => {
    saveFavorites(favorites)
  }, [favorites])

  const toggleFav = (id: string) => {
    setFavorites(prev => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }

  const filtered = useMemo(() => {
    let list = items
    if (showFavOnly) list = list.filter(i => favorites.has(i.id))
    if (catFilter !== 'Все') list = list.filter(i => i.category === catFilter)
    if (tagFilter !== 'Все') list = list.filter(i => i.tag === tagFilter)
    if (search.trim()) {
      const q = search.toLowerCase()
      list = list.filter(i => i.title.toLowerCase().includes(q) || i.category.toLowerCase().includes(q))
    }
    return list
  }, [items, search, catFilter, tagFilter, showFavOnly, favorites])

  const page = filtered.slice(0, offset + PAGE)
  const hasMore = offset + PAGE < filtered.length

  return (
    <div className="catalog">
      <div className="catalog-header">
        <button className="btn btn-secondary" onClick={onBack}>← Назад</button>
        <h2>📚 Каталог квизов</h2>
        <span className="catalog-count">{filtered.length} шт.</span>
        {onPlayCreateOwn && <button className="btn btn-primary btn-sm" onClick={onPlayCreateOwn} style={{ marginLeft: 8 }}>🎙️ Свои вопросы</button>}
      </div>

      <div className="catalog-toolbar">
        <div className="catalog-search">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" width="16" height="16"><circle cx="11" cy="11" r="8"/><path d="M21 21l-4.35-4.35"/></svg>
          <input type="text" placeholder="Поиск по названию или категории..." value={search} onChange={e => { setSearch(e.target.value); setOffset(0) }} />
        </div>
        <div className="catalog-filters">
          <select value={catFilter} onChange={e => { setCatFilter(e.target.value); setOffset(0) }}>
            {CATEGORIES.map(c => <option key={c} value={c}>{CATEGORY_EMOJIS[c] || ''} {c}</option>)}
          </select>
          <select value={tagFilter} onChange={e => { setTagFilter(e.target.value); setOffset(0) }}>
            {TAGS.map(t => <option key={t} value={t}>{t}</option>)}
          </select>
          <button className={`btn btn-sm ${showFavOnly ? 'btn-primary' : 'btn-secondary'}`} onClick={() => { setShowFavOnly(!showFavOnly); setOffset(0) }}>
            ♥ {favorites.size}
          </button>
        </div>
      </div>

      <div className="catalog-grid">
        {page.map(item => (
          <div key={item.id} className="catalog-card">
            <button className="catalog-fav" onClick={() => toggleFav(item.id)} title={favorites.has(item.id) ? 'Убрать из избранного' : 'В избранное'}>
              {favorites.has(item.id) ? '♥' : '♡'}
            </button>
            <div className="catalog-card-emoji">{item.emoji}</div>
            <div className="catalog-card-body">
              <h3>{item.title}</h3>
              <p>{item.description}</p>
              <div className="catalog-card-meta">
                <span className={`tag tag-${item.tag === 'Правда и Ложь' ? 'tf' : item.tag === 'Викторина' ? 'quiz' : 'test'}`}>
                  {item.tag}
                </span>
                {item.questions && <span className="catalog-card-questions">{item.questions.length} вопросов</span>}
              </div>
              <div style={{ display: 'flex', gap: 6 }}>
                <button className="btn btn-primary btn-sm" onClick={() => onImport(item.title, item.description, item.questions!, item.tag)}>📝 Тест</button>
                {onPlayCipher && <button className="btn btn-secondary btn-sm" onClick={() => onPlayCipher(item)}>🔢 Шифр</button>}
              </div>
            </div>
          </div>
        ))}
      </div>

      {hasMore && (
        <div className="catalog-more">
          <button className="btn btn-secondary" onClick={() => setOffset(offset + PAGE)}>Показать ещё ({filtered.length - offset - PAGE} шт.)</button>
        </div>
      )}

      {filtered.length === 0 && (
        <div className="catalog-empty">
          {showFavOnly ? 'Нет избранных квизов. Нажмите ♡ чтобы добавить.' : 'Квизы не найдены. Попробуйте другой поиск.'}
        </div>
      )}
    </div>
  )
}
