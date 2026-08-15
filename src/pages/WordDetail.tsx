import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Save,
  Sparkles,
  GitCompareArrows,
  BookOpen,
  FileText,
  Plus,
  X,
  Star,
} from 'lucide-react'
import gsap from 'gsap'
import dayjs from 'dayjs'
import { fetchReviewLogs, fetchWord, fetchWords, updateWord, deleteWord } from '../services/words'
import { fetchBook } from '../services/books'
import { addFavorite } from '../services/favorites'
import { describeNextReview } from '../services/review'
import {
  generateExamples,
  analyzeRoots,
  compareConfusables,
  generateStory,
  AIError,
} from '../services/ai'
import { useSettings } from '../stores/settings'
import { useT } from '../i18n'
import type { Book, ExampleSentence, ReviewLog, Word } from '../types'
import { Button } from '../components/ui/button'
import { Card, CardTitle } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Input, Textarea } from '../components/ui/input'
import { AILoading } from '../components/AILoading'
import { SpeakButton } from '../components/SpeakButton'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'

type AIAction = 'examples' | 'roots' | 'confusables' | 'story'

export default function WordDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()
  const apiKey = useSettings((s) => s.apiKey)

  const [word, setWord] = useState<Word | null>(null)
  const [book, setBook] = useState<Book | null>(null)
  const [logs, setLogs] = useState<ReviewLog[]>([])
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState<Partial<Word>>({})
  const [tagInput, setTagInput] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  // 已收藏的例句下标（会话内记忆，避免重复提交）
  const [savedSentences, setSavedSentences] = useState<Set<number>>(new Set())

  const [aiLoading, setAiLoading] = useState<AIAction | null>(null)
  const [aiOutput, setAiOutput] = useState<{ action: AIAction; text: string } | null>(null)
  const [aiError, setAiError] = useState<string | null>(null)

  const rootRef = useRef<HTMLDivElement>(null)

  const AI_ACTIONS: { key: AIAction; label: string; icon: typeof Sparkles }[] = [
    { key: 'examples', label: t('detail.moreExamples'), icon: Sparkles },
    { key: 'roots', label: t('detail.rootBreakdown'), icon: BookOpen },
    { key: 'confusables', label: t('detail.confusables'), icon: GitCompareArrows },
    { key: 'story', label: t('detail.miniStory'), icon: FileText },
  ]

  const load = useCallback(async () => {
    if (!id) return
    const [w, l] = await Promise.all([fetchWord(id), fetchReviewLogs(id)])
    setWord(w)
    setLogs(l)
    // 单词本决定朗读和 AI 的目标语言
    if (w.book_id) {
      fetchBook(w.book_id)
        .then(setBook)
        .catch(() => setBook(null))
    }
  }, [id])

  useEffect(() => {
    load().catch(console.error)
  }, [load])

  // 区块交错入场
  useEffect(() => {
    if (word && rootRef.current) {
      gsap.fromTo(
        rootRef.current.children,
        { opacity: 0, y: 20 },
        { opacity: 1, y: 0, duration: 0.45, stagger: 0.07, ease: 'power2.out' },
      )
    }
  }, [word])

  if (!word) return <p className="py-20 text-center font-bold text-ink-soft">{t('common.loading')}</p>

  const bookLang = book?.language ?? 'en'
  const accuracy = word.review_count
    ? Math.round((word.correct_count / word.review_count) * 100)
    : 0

  // ---------- 编辑 ----------
  const startEdit = () => {
    setDraft({ ...word })
    setEditing(true)
  }

  const saveEdit = async () => {
    try {
      const updated = await updateWord(word.id, {
        word: draft.word,
        phonetic: draft.phonetic,
        meaning_cn: draft.meaning_cn,
        meaning_en: draft.meaning_en,
        part_of_speech: draft.part_of_speech,
        root_affix: draft.root_affix,
        notes: draft.notes,
        tags: draft.tags ?? [],
      })
      setWord(updated)
      setEditing(false)
    } catch (e) {
      console.error(e)
    }
  }

  const handleDelete = async () => {
    await deleteWord(word.id)
    navigate('/words')
  }

  // ---------- AI 增强 ----------
  const runAI = async (action: AIAction) => {
    setAiLoading(action)
    setAiError(null)
    setAiOutput(null)
    try {
      let text = ''
      if (action === 'examples') {
        const exs = await generateExamples(word.word, bookLang)
        text = exs.map((e) => `${e.en}\n${e.cn}`).join('\n\n')
      } else if (action === 'roots') {
        text = await analyzeRoots(word.word, bookLang)
      } else if (action === 'confusables') {
        text = await compareConfusables(word.word, bookLang)
      } else {
        const known = await fetchWords({ mastery: 'mastered', sort: 'newest', bookId: word.book_id })
        text = await generateStory(
          word.word,
          known.map((w) => w.word),
          bookLang,
        )
      }
      setAiOutput({ action, text })
    } catch (e) {
      setAiError(e instanceof AIError ? e.message : 'AI request failed. Try again.')
    } finally {
      setAiLoading(null)
    }
  }

  /** 一键保存 AI 内容到 notes */
  const saveAIOutput = async () => {
    if (!aiOutput) return
    const label = AI_ACTIONS.find((a) => a.key === aiOutput.action)?.label ?? 'AI'
    const appended = `${word.notes ? word.notes + '\n\n' : ''}【${label}】\n${aiOutput.text}`
    const updated = await updateWord(word.id, { notes: appended })
    setWord(updated)
    setAiOutput(null)
  }

  const addTag = () => {
    const tg = tagInput.trim()
    const current = draft.tags ?? []
    if (tg && !current.includes(tg)) setDraft({ ...draft, tags: [...current, tg] })
    setTagInput('')
  }

  /** 把例句一键收藏到收藏本（句子分类） */
  const saveSentence = async (i: number, ex: ExampleSentence) => {
    if (savedSentences.has(i)) return
    try {
      await addFavorite({
        kind: 'sentence',
        content: ex.en,
        translation: ex.cn,
        note: '',
        source_word_id: word.id,
      })
      setSavedSentences((s) => new Set(s).add(i))
    } catch (e) {
      console.error(e)
    }
  }

  return (
    <div ref={rootRef} className="flex flex-col gap-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between">
        <Button variant="ghost" size="sm" onClick={() => navigate(-1)}>
          <ArrowLeft size={18} /> {t('common.back')}
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => (editing ? saveEdit() : startEdit())}>
            {editing ? <Save size={16} /> : <Pencil size={16} />}
            {editing ? t('common.save') : t('common.edit')}
          </Button>
          <Button variant="danger" size="sm" onClick={() => setConfirmDelete(true)}>
            <Trash2 size={16} />
          </Button>
        </div>
      </div>

      {/* 主信息卡 */}
      <Card>
        {editing ? (
          <div className="flex flex-col gap-3">
            <Input value={draft.word ?? ''} onChange={(e) => setDraft({ ...draft, word: e.target.value })} placeholder={t('detail.phWord')} />
            <Input value={draft.phonetic ?? ''} onChange={(e) => setDraft({ ...draft, phonetic: e.target.value })} placeholder={t('detail.phPhonetic')} />
            <Input value={draft.part_of_speech ?? ''} onChange={(e) => setDraft({ ...draft, part_of_speech: e.target.value })} placeholder={t('detail.phPos')} />
            <Textarea value={draft.meaning_cn ?? ''} onChange={(e) => setDraft({ ...draft, meaning_cn: e.target.value })} placeholder={t('detail.phMeaning')} />
            <Textarea value={draft.meaning_en ?? ''} onChange={(e) => setDraft({ ...draft, meaning_en: e.target.value })} placeholder={t('detail.phDefinition')} />
            <Textarea value={draft.root_affix ?? ''} onChange={(e) => setDraft({ ...draft, root_affix: e.target.value })} placeholder={t('detail.phRoots')} />
            <Textarea value={draft.notes ?? ''} onChange={(e) => setDraft({ ...draft, notes: e.target.value })} placeholder={t('detail.phNotes')} />
            <div className="flex flex-wrap items-center gap-2">
              {(draft.tags ?? []).map((tg) => (
                <Badge key={tg} variant="green" onClick={() => setDraft({ ...draft, tags: (draft.tags ?? []).filter((x) => x !== tg) })}>
                  {tg} <X size={12} className="ml-1" />
                </Badge>
              ))}
              <Input className="h-9 w-28 text-sm" placeholder={t('detail.phTag')} value={tagInput}
                onChange={(e) => setTagInput(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())} />
              <Button size="sm" variant="outline" onClick={addTag}><Plus size={14} /></Button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-3xl font-black text-ink">{word.word}</h1>
              {/* 音标 + 喇叭朗读（按单词本语言发音） */}
              <span className="flex items-center gap-1 font-bold text-ink-soft">
                <SpeakButton text={word.word} lang={bookLang} size={18} />
                {word.phonetic}
              </span>
              {word.part_of_speech && <Badge variant="blue">{word.part_of_speech}</Badge>}
              {book && <Badge variant="green">{book.name}</Badge>}
            </div>
            <p className="mt-3 text-lg font-bold text-ink">{word.meaning_cn}</p>
            <p className="mt-1 text-ink-soft">{word.meaning_en}</p>
            {word.tags.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {word.tags.map((tg) => (
                  <Badge key={tg} variant="green">#{tg}</Badge>
                ))}
              </div>
            )}
          </>
        )}
      </Card>

      {/* 学习状态 */}
      <Card className="grid grid-cols-4 gap-2 text-center">
        <Stat label={t('detail.level')} value={`${word.mastery_level}/7`} />
        <Stat label={t('detail.reviews')} value={String(word.review_count)} />
        <Stat label={t('detail.accuracy')} value={`${accuracy}%`} />
        <Stat label={t('detail.next')} value={describeNextReview(word.next_review_at)} />
      </Card>

      {/* 例句 */}
      {!editing && word.example_sentences.length > 0 && (
        <Card>
          <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">{t('detail.examples')}</CardTitle>
          <ul className="flex flex-col gap-2">
            {word.example_sentences.map((ex, i) => (
              <li key={i} className="group flex items-start justify-between gap-2 rounded-xl bg-paper p-3">
                <div className="min-w-0">
                  <p className="font-bold text-ink">{ex.en}</p>
                  <p className="text-sm text-ink-soft">{ex.cn}</p>
                </div>
                {/* 一键收藏到句子 */}
                <button
                  onClick={() => saveSentence(i, ex)}
                  title={t('detail.saveSentence')}
                  className={`shrink-0 cursor-pointer rounded-full p-1.5 transition-all ${
                    savedSentences.has(i)
                      ? 'text-duo-yellow-dark'
                      : 'text-gray-300 hover:text-duo-yellow-dark'
                  }`}
                  aria-label={t('detail.saveSentence')}
                >
                  <Star size={16} fill={savedSentences.has(i) ? 'currentColor' : 'none'} />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      )}

      {/* 构词解析 */}
      {!editing && word.root_affix && (
        <Card>
          <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">{t('detail.roots')}</CardTitle>
          <p className="whitespace-pre-wrap text-[15px] text-ink">{word.root_affix}</p>
        </Card>
      )}

      {/* 笔记 */}
      {!editing && word.notes && (
        <Card>
          <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">{t('detail.notes')}</CardTitle>
          <p className="whitespace-pre-wrap text-[15px] text-ink">{word.notes}</p>
        </Card>
      )}

      {/* AI 增强 */}
      <Card className="border-duo-blue/40 bg-duo-blue/5">
        <CardTitle className="mb-3 flex items-center gap-2">
          <Sparkles size={18} className="text-duo-blue" /> {t('detail.aiBoost')}
        </CardTitle>
        {!apiKey && (
          <p className="mb-2 text-sm font-bold text-duo-red">{t('detail.noKey')}</p>
        )}
        <div className="grid grid-cols-2 gap-2">
          {AI_ACTIONS.map(({ key, label, icon: Icon }) => (
            <Button
              key={key}
              variant="outline"
              size="sm"
              disabled={!apiKey || aiLoading !== null}
              onClick={() => runAI(key)}
            >
              <Icon size={14} /> {label}
            </Button>
          ))}
        </div>
        {aiLoading && (
          <div className="mt-3 flex justify-center py-3">
            <AILoading
              label={`${t('detail.generating')} ${AI_ACTIONS.find((a) => a.key === aiLoading)?.label}`}
            />
          </div>
        )}
        {aiError && <p className="mt-3 text-sm font-bold text-duo-red">{aiError}</p>}
        {aiOutput && (
          <div className="mt-3 rounded-xl bg-white p-3">
            <p className="whitespace-pre-wrap text-[15px] text-ink">{aiOutput.text}</p>
            <div className="mt-3 flex gap-2">
              <Button size="sm" onClick={saveAIOutput}>{t('detail.saveToNotes')}</Button>
              <Button size="sm" variant="ghost" onClick={() => setAiOutput(null)}>{t('common.dismiss')}</Button>
            </div>
          </div>
        )}
      </Card>

      {/* 复习历史 */}
      <Card>
        <CardTitle className="mb-2 text-sm uppercase tracking-wide text-ink-soft">
          {t('detail.history')}
        </CardTitle>
        {logs.length === 0 ? (
          <p className="text-sm font-bold text-ink-soft">{t('detail.noReviews')}</p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {logs.map((log) => (
              <li key={log.id} className="flex items-center justify-between text-sm">
                <span className="font-bold text-ink-soft">
                  {dayjs(log.reviewed_at).format('MMM D, HH:mm')}
                </span>
                <span className="flex items-center gap-2">
                  <span className="text-xs font-bold text-gray-400">
                    Lv.{log.stage_before} → Lv.{log.stage_after}
                  </span>
                  <Badge
                    variant={
                      log.feedback === 'know' ? 'green' : log.feedback === 'fuzzy' ? 'yellow' : 'red'
                    }
                  >
                    {t(`review.${log.feedback}`)}
                  </Badge>
                </span>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {/* 删除确认 */}
      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogTitle>{t('detail.deleteTitle')}</DialogTitle>
          <p className="mt-2 font-semibold text-ink-soft">{t('detail.deleteMsg')}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="danger" className="flex-1" onClick={handleDelete}>
              {t('common.delete')}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setConfirmDelete(false)}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-xs font-extrabold uppercase text-ink-soft">{label}</p>
      <p className="text-lg font-black text-ink">{value}</p>
    </div>
  )
}
