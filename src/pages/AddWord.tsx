import { useEffect, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { Sparkles, Plus, X } from 'lucide-react'
import gsap from 'gsap'
import { completeWord, AIError } from '../services/ai'
import { createWord } from '../services/words'
import { fetchBooks, ensureDefaultBook, type BookWithCount } from '../services/books'
import { useSettings } from '../stores/settings'
import { useT } from '../i18n'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { AILoading } from '../components/AILoading'
import { SpeakButton } from '../components/SpeakButton'
import type { AIWordCompletion } from '../types'

/**
 * 核心添加流程：
 * 选单词本（语言）→ 输入单词 → AI 按目标语言自动补全 → 预览确认 → 存库
 */
export default function AddWord() {
  const navigate = useNavigate()
  const [searchParams, setSearchParams] = useSearchParams()
  const t = useT()
  const apiKey = useSettings((s) => s.apiKey)

  const [books, setBooks] = useState<BookWithCount[]>([])
  const [bookId, setBookId] = useState<string | null>(null)
  const [word, setWord] = useState('')
  const [tags, setTags] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [aiResult, setAiResult] = useState<AIWordCompletion | null>(null)
  const [loading, setLoading] = useState(false)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const resultRef = useRef<HTMLDivElement>(null)

  // 从阅读页跳转过来：?word=xxx 自动填充输入框（一次性，填充后清掉参数）
  useEffect(() => {
    const q = searchParams.get('word')
    if (q) {
      setWord(q)
      setSearchParams({}, { replace: true })
    }
  }, [searchParams, setSearchParams])

  // 加载单词本（首次自动建默认本）
  useEffect(() => {
    ensureDefaultBook()
      .then(() => fetchBooks())
      .then((list) => {
        setBooks(list)
        if (list.length > 0) setBookId(list[0].id)
      })
      .catch(console.error)
  }, [])

  const activeBook = books.find((b) => b.id === bookId) ?? null
  const bookLang = activeBook?.language ?? 'en'

  // AI 结果入场动画
  useEffect(() => {
    if (aiResult && resultRef.current) {
      gsap.fromTo(
        resultRef.current,
        { opacity: 0, y: 24, scale: 0.96 },
        { opacity: 1, y: 0, scale: 1, duration: 0.5, ease: 'back.out(1.5)' },
      )
    }
  }, [aiResult])

  const handleFetch = async () => {
    const w = word.trim()
    if (!w) return
    setLoading(true)
    setError(null)
    setAiResult(null)
    try {
      const result = await completeWord(w, bookLang)
      setAiResult(result)
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Something went wrong. Please try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    const w = word.trim()
    if (!w || !aiResult) return
    setSaving(true)
    setError(null)
    try {
      const saved = await createWord({
        word: w.toLowerCase(),
        book_id: bookId,
        phonetic: aiResult.phonetic,
        meaning_cn: aiResult.meaning_cn,
        meaning_en: aiResult.meaning_en,
        part_of_speech: aiResult.part_of_speech,
        example_sentences: aiResult.examples,
        root_affix: aiResult.root_affix,
        tags,
      })
      navigate(`/words/${saved.id}`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
      setSaving(false)
    }
  }

  const addTag = () => {
    const tg = tagInput.trim()
    if (tg && !tags.includes(tg)) setTags([...tags, tg])
    setTagInput('')
  }

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-black text-ink">{t('add.title')}</h1>
        <p className="font-bold text-ink-soft">{t('add.subtitle')}</p>
      </header>

      {!apiKey && (
        <Card className="border-duo-yellow bg-duo-yellow/10">
          <p className="text-sm font-bold text-ink">
            {t('add.noKey')}{' '}
            <button
              className="text-duo-blue underline cursor-pointer"
              onClick={() => navigate('/settings')}
            >
              Settings
            </button>
          </p>
        </Card>
      )}

      {/* 单词本选择（决定目标语言） */}
      <div className="flex flex-col gap-1.5">
        <span className="text-xs font-extrabold uppercase text-ink-soft">{t('books.select')}</span>
        <div className="flex flex-wrap gap-2">
          {books.map((b) => (
            <Badge
              key={b.id}
              variant={bookId === b.id ? 'green' : 'gray'}
              onClick={() => {
                setBookId(b.id)
                setAiResult(null)
              }}
            >
              {b.name}
            </Badge>
          ))}
        </div>
      </div>

      <div className="flex gap-2">
        <Input
          placeholder={t('add.placeholder')}
          value={word}
          onChange={(e) => setWord(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleFetch()}
          autoFocus
          className="text-lg"
        />
        <Button onClick={handleFetch} disabled={loading || !word.trim() || !apiKey} size="md">
          <Sparkles size={18} />
          {!loading && 'Go'}
        </Button>
      </div>

      {loading && (
        <Card className="flex items-center justify-center py-8">
          <AILoading label={t('add.fetching')} />
        </Card>
      )}

      {error && (
        <Card className="border-duo-red bg-duo-red/5">
          <p className="text-sm font-bold text-duo-red">{error}</p>
        </Card>
      )}

      {aiResult && (
        <div ref={resultRef} className="flex flex-col gap-4">
          <Card>
            <CardTitle className="flex flex-wrap items-center gap-3">
              <span className="text-2xl font-black">{word.trim()}</span>
              {/* 音标 + 喇叭朗读（按单词本语言发音） */}
              <span className="flex items-center gap-1 text-base font-bold text-ink-soft">
                <SpeakButton text={word.trim()} lang={bookLang} size={18} />
                {aiResult.phonetic}
              </span>
              <Badge variant="blue">{aiResult.part_of_speech}</Badge>
            </CardTitle>
            <div className="mt-3 flex flex-col gap-2 text-[15px]">
              <p className="font-bold text-ink">{aiResult.meaning_cn}</p>
              <p className="text-ink-soft">{aiResult.meaning_en}</p>
            </div>
          </Card>

          <Card>
            <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">
              {t('add.examples')}
            </CardTitle>
            <ul className="flex flex-col gap-3">
              {aiResult.examples.map((ex, i) => (
                <li key={i} className="rounded-xl bg-paper p-3">
                  <p className="font-bold text-ink">{ex.en}</p>
                  <p className="text-sm text-ink-soft">{ex.cn}</p>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">
              {t('add.roots')}
            </CardTitle>
            <p className="text-[15px] text-ink">{aiResult.root_affix}</p>
          </Card>

          {/* 标签 */}
          <Card>
            <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">
              {t('add.tags')}
            </CardTitle>
            <div className="flex flex-wrap items-center gap-2">
              {tags.map((tg) => (
                <Badge key={tg} variant="green" onClick={() => setTags(tags.filter((x) => x !== tg))}>
                  {tg} <X size={12} className="ml-1" />
                </Badge>
              ))}
              <div className="flex gap-2">
                <Input
                  className="h-9 w-32 text-sm"
                  placeholder={t('add.tagPlaceholder')}
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
                />
                <Button size="sm" variant="outline" onClick={addTag}>
                  <Plus size={14} />
                </Button>
              </div>
            </div>
          </Card>

          <Button size="lg" onClick={handleSave} disabled={saving}>
            {saving ? t('add.saving') : t('add.save')}
          </Button>
        </div>
      )}
    </div>
  )
}
