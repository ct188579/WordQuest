import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  RefreshCw,
  Volume2,
  Languages,
  Plus,
  BookOpen,
  ExternalLink,
  Link2,
  ChevronRight,
  Newspaper,
  Search,
  X,
} from 'lucide-react'
import gsap from 'gsap'
import { generatePressArticle, annotatePressArticle, AIError } from '../services/ai'
import {
  fetchPressArticles,
  extractArticle,
  splitArticleParagraphs,
  sourceHost,
  PRESS_FEEDS,
  SearchError,
  type PressArticleItem,
} from '../services/search'
import { useSettings, type Freshness } from '../stores/settings'
import { usePress, type PressVocab } from '../stores/press'
import { useT } from '../i18n'
import { Button } from './ui/button'
import { Input } from './ui/input'
import { Card, CardTitle } from './ui/card'
import { Badge } from './ui/badge'
import { AILoading } from './AILoading'
import { sanitizeWord } from '../lib/text'
import { cn } from '../lib/utils'

/** AI 仿写可选的刊物（英文原名，不翻译） */
const PRESS_SOURCES = [
  'The Economist',
  'The New York Times',
  'The Guardian',
  'Bloomberg',
  'Scientific American',
  'The Atlantic',
]

const MODES = [
  { key: 'live' as const, labelKey: 'press.modeLive' },
  { key: 'ai' as const, labelKey: 'press.modeAi' },
]

const FRESH_OPTS: { key: Freshness; labelKey: string }[] = [
  { key: 'week', labelKey: 'read.freshWeek' },
  { key: 'month', labelKey: 'read.freshMonth' },
  { key: 'any', labelKey: 'read.freshAny' },
]

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** 从抽取的原文里猜一个标题（第一个像标题的短行） */
function guessTitle(raw: string): string {
  const lines = raw
    .split('\n')
    .map((l) => l.replace(/[#*_>`]/g, '').trim())
    .filter(Boolean)
  return (
    lines.find(
      (l) =>
        l.length >= 15 &&
        l.length <= 120 &&
        !l.startsWith('[') &&
        !l.startsWith('!') &&
        !l.startsWith('http'),
    ) ?? ''
  )
}

interface Lookup {
  vocab: PressVocab
  x: number
  y: number
}

/** 划词结果：选中一段文字 → 悬浮操作条（查词 / 词库搜索） */
interface Pick {
  text: string
  /** 清洗后是单个词时非空；短语 / 句子为 null */
  word: string | null
  x: number
  y: number
}

export default function PressReading() {
  const t = useT()
  const navigate = useNavigate()
  const { article, setArticle, clearArticle } = usePress()
  const { tavilyKey } = useSettings()

  // 内容来源模式：live = 真实外刊抓取；ai = AI 仿写
  const [mode, setMode] = useState<'live' | 'ai'>('live')

  // AI 仿写
  const [aiSource, setAiSource] = useState(PRESS_SOURCES[0])
  const [topicInput, setTopicInput] = useState('')

  // 真实外刊
  const [feedIdx, setFeedIdx] = useState(0)
  const [listFresh, setListFresh] = useState<Freshness>('week')
  const [items, setItems] = useState<PressArticleItem[]>([])
  const [listLoading, setListLoading] = useState(false)
  const [urlInput, setUrlInput] = useState('')

  const [busy, setBusy] = useState<null | 'ai' | 'extract' | 'annotate'>(null)
  const [error, setError] = useState<string | null>(null)
  const [openTrans, setOpenTrans] = useState<number[]>([])
  const [lookup, setLookup] = useState<Lookup | null>(null)
  const [pick, setPick] = useState<Pick | null>(null)

  const articleRef = useRef<HTMLDivElement>(null)
  const lookupRef = useRef<HTMLDivElement>(null)
  const pickRef = useRef<HTMLDivElement>(null)

  const hasKey = Boolean(tavilyKey.trim())

  // 核心词汇 → 词边界正则（长的优先，避免短词截断长词）
  const highlightRe = useMemo(() => {
    if (!article?.vocabulary.length) return null
    const sorted = [...article.vocabulary].sort((a, b) => b.word.length - a.word.length)
    return new RegExp(`\\b(${sorted.map((v) => escapeRegExp(v.word)).join('|')})\\b`, 'gi')
  }, [article])

  const isVocab = (w: string) =>
    article?.vocabulary.some((v) => v.word.toLowerCase() === w.toLowerCase()) ?? false

  const findVocab = (w: string) =>
    article?.vocabulary.find((v) => v.word.toLowerCase() === w.toLowerCase())

  // 文章入场动画
  useEffect(() => {
    if (!article || !articleRef.current) return
    gsap.fromTo(
      articleRef.current.querySelectorAll('.press-block'),
      { opacity: 0, y: 14 },
      { opacity: 1, y: 0, duration: 0.45, stagger: 0.06, ease: 'power2.out' },
    )
  }, [article])

  // 查词弹卡入场动画
  useEffect(() => {
    if (lookup && lookupRef.current) {
      gsap.fromTo(
        lookupRef.current,
        { scale: 0.7, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.25, ease: 'back.out(2)' },
      )
    }
  }, [lookup])

  // 点其它位置关闭弹卡
  useEffect(() => {
    if (!lookup) return
    const onPointerDown = (e: PointerEvent) => {
      if (lookupRef.current && !lookupRef.current.contains(e.target as Node)) setLookup(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [lookup])

  // 划词操作条入场动画
  useEffect(() => {
    if (pick && pickRef.current) {
      gsap.fromTo(
        pickRef.current,
        { scale: 0.75, opacity: 0, y: -4 },
        { scale: 1, opacity: 1, y: 0, duration: 0.22, ease: 'back.out(2)' },
      )
    }
  }, [pick])

  // 点其它位置关闭划词条
  useEffect(() => {
    if (!pick) return
    const onPointerDown = (e: PointerEvent) => {
      if (pickRef.current && !pickRef.current.contains(e.target as Node)) setPick(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [pick])

  /**
   * 划词查询：在正文里选中任意文字 → 悬浮操作条
   * 一次点击（未选中）会自动关掉操作条，不影响核心词点按查义。
   */
  const readSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed || sel.rangeCount === 0) {
      setPick(null)
      return
    }
    const raw = sel
      .toString()
      .replace(/\s+/g, ' ')
      .trim()
      // 去掉首尾标点，短语也不会把逗号句号一起带走
      .replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
    if (!raw || raw.length > 60) {
      setPick(null)
      return
    }
    const range = sel.getRangeAt(0)
    // 只认正文区域内的选中（操作条本身在容器外，天然不会误触发）
    if (!articleRef.current?.contains(range.commonAncestorContainer)) return
    const rect = range.getBoundingClientRect()
    if (!rect.width && !rect.height) return
    setLookup(null)
    setPick({
      text: raw,
      word: sanitizeWord(raw),
      x: rect.left + rect.width / 2,
      y: rect.top,
    })
  }

  /** 查词：跳到「添加单词」页，AI 自动补全释义（确认后即可收入词库） */
  const lookupAndGo = (text: string) => {
    navigate(`/add?word=${encodeURIComponent(text)}&auto=1`)
    setPick(null)
  }

  /** 词库搜索：跳到词库页并带上搜索词，看看是不是已经收藏过 */
  const searchLibrary = (text: string) => {
    navigate(`/words?q=${encodeURIComponent(text)}`)
    setPick(null)
  }

  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  const errText = (e: unknown): string => {
    if (e instanceof AIError || e instanceof SearchError) return e.message
    return t('press.failed')
  }

  // ---------- 拉取某刊近期真实文章列表 ----------
  const loadList = async () => {
    setListLoading(true)
    setError(null)
    try {
      const list = await fetchPressArticles(PRESS_FEEDS[feedIdx], { freshness: listFresh })
      setItems(list)
      if (!list.length) setError(t('press.noArticles'))
    } catch (e) {
      setError(errText(e))
    } finally {
      setListLoading(false)
    }
  }

  // ---------- 精读一篇真实外刊：抽正文 → AI 标注（不改写原文） ----------
  const readArticle = async (url: string, knownTitle?: string) => {
    setBusy('extract')
    setError(null)
    setLookup(null)
    setPick(null)
    try {
      const raw = await extractArticle(url)
      const candidates = splitArticleParagraphs(raw)
      if (candidates.length < 3) {
        setError(t('press.wallBlocked'))
        return
      }
      setBusy('annotate')
      const host = sourceHost(url)
      const title = knownTitle?.trim() || guessTitle(raw) || host

      // 首段往往是把页面大标题又抄了一遍，去掉（避免正文第一行重复标题）
      const norm = (x: string) => x.replace(/[^a-z0-9]/gi, '').toLowerCase()
      const head = norm(title).slice(0, 36)
      if (head.length >= 12 && candidates.length > 3 && norm(candidates[0]).includes(head)) {
        candidates.shift()
      }

      const annotated = await annotatePressArticle(candidates, { title, source: host })
      if (annotated.paragraphs.length < 3) {
        setError(t('press.wallBlocked'))
        return
      }
      setArticle({
        origin: 'live',
        source: host,
        title,
        paragraphs: annotated.paragraphs,
        translations: annotated.translations,
        vocabulary: annotated.vocabulary,
        url,
        savedAt: Date.now(),
      })
      setOpenTrans([])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(errText(e))
    } finally {
      setBusy(null)
    }
  }

  // ---------- AI 仿写（原功能） ----------
  const generate = async () => {
    setBusy('ai')
    setError(null)
    setLookup(null)
    setPick(null)
    try {
      const result = await generatePressArticle(aiSource, topicInput.trim() || null)
      setArticle({ ...result, origin: 'ai', source: aiSource, savedAt: Date.now() })
      setOpenTrans([])
      window.scrollTo({ top: 0, behavior: 'smooth' })
    } catch (e) {
      setError(e instanceof AIError ? e.message : t('press.failed'))
    } finally {
      setBusy(null)
    }
  }

  const speakPara = (text: string) => {
    if (!('speechSynthesis' in window)) return
    window.speechSynthesis.cancel()
    const u = new SpeechSynthesisUtterance(text)
    u.lang = 'en-US'
    u.rate = 0.92
    const voices = window.speechSynthesis.getVoices()
    const voice = voices.find((v) => v.lang === 'en-US') ?? voices.find((v) => v.lang.startsWith('en'))
    if (voice) u.voice = voice
    window.speechSynthesis.speak(u)
  }

  const toggleTrans = (i: number) =>
    setOpenTrans((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]))

  /** 渲染段落：核心词汇高亮为可点 mark */
  const renderPara = (para: string) => {
    if (!highlightRe) return para
    return para.split(highlightRe).map((part, i) =>
      isVocab(part) ? (
        <mark
          key={i}
          onClick={(e) => {
            const vocab = findVocab(part)!
            const rect = (e.target as HTMLElement).getBoundingClientRect()
            // 双击选中同一个词时：收起划词条，只留这张释义卡
            window.getSelection()?.removeAllRanges()
            setPick(null)
            setLookup({ vocab, x: rect.left + rect.width / 2, y: rect.top })
          }}
          className="cursor-pointer rounded bg-transparent px-0 font-bold text-duo underline decoration-duo/40 decoration-2 underline-offset-4 transition-colors hover:bg-duo/10 hover:decoration-duo"
        >
          {part}
        </mark>
      ) : (
        part
      ),
    )
  }

  const lookupAbove = lookup ? lookup.y > 180 : true
  const lookupLeft = lookup ? Math.min(Math.max(lookup.x, 110), window.innerWidth - 110) : 0

  // 划词操作条略宽，横向留更多边距避免溢出屏幕
  const pickAbove = pick ? pick.y > 170 : true
  const pickLeft = pick ? Math.min(Math.max(pick.x, 190), Math.max(window.innerWidth - 190, 190)) : 0

  const spinner =
    busy === 'extract' ? t('press.extracting') : busy === 'annotate' ? t('press.annotating') : ''

  return (
    <div className="flex flex-col gap-4">
      {/* ---------- 来源模式切换 ---------- */}
      {!article && (
        <div className="flex gap-1 rounded-xl border border-ink/10 p-1">
          {MODES.map((m) => (
            <button
              key={m.key}
              onClick={() => {
                setMode(m.key)
                setError(null)
              }}
              className={cn(
                'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-bold transition-all',
                mode === m.key ? 'bg-duo/10 text-duo' : 'text-ink-soft hover:text-ink',
              )}
            >
              {m.key === 'live' ? <Newspaper size={15} /> : <Sparkles size={15} />}
              {t(m.labelKey)}
            </button>
          ))}
        </div>
      )}

      {/* ---------- 真实外刊 ---------- */}
      {!article && mode === 'live' && (
        <Card className="flex flex-col gap-4">
          {!hasKey ? (
            <p className="text-sm font-semibold text-ink-soft">{t('read.searchNoKey')}</p>
          ) : (
            <>
              <div>
                <CardTitle className="mb-2.5 text-sm text-ink-soft">{t('press.pickFeed')}</CardTitle>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                  {PRESS_FEEDS.map((f, i) => (
                    <button
                      key={f.domain}
                      onClick={() => {
                        setFeedIdx(i)
                        setItems([])
                      }}
                      className={cn(
                        'cursor-pointer rounded-xl border-2 px-3 py-2.5 text-left font-serif text-sm font-bold transition-all',
                        feedIdx === i
                          ? 'border-duo bg-duo/5 text-duo'
                          : 'border-gray-200 bg-white text-ink-soft hover:border-gray-300',
                      )}
                    >
                      {f.name}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold text-ink-soft">{t('read.freshness')}</span>
                {FRESH_OPTS.map((f) => (
                  <button
                    key={f.key}
                    onClick={() => {
                      setListFresh(f.key)
                      setItems([])
                    }}
                    className={cn(
                      'cursor-pointer rounded-lg px-2.5 py-1 text-xs font-bold transition-colors',
                      listFresh === f.key ? 'bg-duo/10 text-duo' : 'text-ink-soft hover:bg-gray-100',
                    )}
                  >
                    {t(f.labelKey)}
                  </button>
                ))}
              </div>

              <Button onClick={loadList} disabled={listLoading || busy !== null}>
                <RefreshCw size={16} className={cn(listLoading && 'animate-spin')} />
                {listLoading ? t('press.fetching') : t('press.fetch')}
              </Button>

              {/* 文章列表 */}
              {items.length > 0 && (
                <div className="flex flex-col divide-y divide-ink/5">
                  {items.map((it) => (
                    <button
                      key={it.url}
                      onClick={() => readArticle(it.url, it.title)}
                      disabled={busy !== null}
                      className="group flex cursor-pointer items-start justify-between gap-3 py-3 text-left transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <div className="min-w-0">
                        <p className="font-serif text-[15px] font-bold leading-snug text-ink group-hover:text-duo">
                          {it.title}
                        </p>
                        <p className="mt-1 line-clamp-2 text-xs text-ink-soft">{it.snippet}</p>
                        <p className="mt-1 text-[11px] font-semibold text-ink-soft/60">
                          {it.host}
                          {it.publishedDate ? ` · ${it.publishedDate}` : ''}
                        </p>
                      </div>
                      <span className="mt-0.5 flex shrink-0 items-center gap-1 text-xs font-bold text-duo">
                        {t('press.readThis')} <ChevronRight size={14} />
                      </span>
                    </button>
                  ))}
                </div>
              )}

              {/* 粘贴任意文章链接 */}
              <div className="flex flex-col gap-1.5 border-t border-ink/5 pt-3">
                <span className="text-xs font-bold text-ink-soft">{t('press.orPaste')}</span>
                <div className="flex gap-2">
                  <Input
                    placeholder={t('press.urlPh')}
                    value={urlInput}
                    onChange={(e) => setUrlInput(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' && urlInput.trim() && busy === null) {
                        readArticle(urlInput.trim())
                        setUrlInput('')
                      }
                    }}
                  />
                  <Button
                    onClick={() => {
                      if (!urlInput.trim()) return
                      readArticle(urlInput.trim())
                      setUrlInput('')
                    }}
                    disabled={!urlInput.trim() || busy !== null}
                  >
                    <Link2 size={16} />
                  </Button>
                </div>
                <p className="text-xs font-semibold text-ink-soft/70">{t('press.urlHint')}</p>
              </div>
            </>
          )}

          {error && <p className="text-sm font-bold text-duo-red">{error}</p>}
        </Card>
      )}

      {/* ---------- AI 仿写 ---------- */}
      {!article && mode === 'ai' && (
        <Card className="flex flex-col gap-4">
          <div>
            <CardTitle className="mb-2.5 text-sm text-ink-soft">{t('press.chooseSource')}</CardTitle>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              {PRESS_SOURCES.map((s) => (
                <button
                  key={s}
                  onClick={() => setAiSource(s)}
                  className={cn(
                    'cursor-pointer rounded-xl border-2 px-3 py-2.5 text-left font-serif text-sm font-bold transition-all',
                    aiSource === s
                      ? 'border-duo bg-duo/5 text-duo'
                      : 'border-gray-200 bg-white text-ink-soft hover:border-gray-300',
                  )}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-col gap-1.5">
            <Input
              placeholder={t('press.topicPh')}
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && busy === null && generate()}
            />
            <p className="text-xs font-semibold text-ink-soft/70">{t('press.topicHint')}</p>
          </div>

          {error && <p className="text-sm font-bold text-duo-red">{error}</p>}

          <Button onClick={generate} disabled={busy !== null}>
            <Sparkles size={18} />
            {busy === 'ai'
              ? t('press.generating').replace('{source}', aiSource)
              : t('press.generate')}
          </Button>
        </Card>
      )}

      {/* ---------- 处理中 ---------- */}
      {busy && busy !== 'ai' && (
        <Card className="flex items-center justify-center py-8">
          <AILoading label={spinner} />
        </Card>
      )}

      {/* ---------- 精读文章 ---------- */}
      {article && !busy && (
        <div
          ref={articleRef}
          className="flex flex-col gap-4"
          onMouseUp={readSelection}
          onTouchEnd={readSelection}
        >
          {/* 刊头 */}
          <div className="press-block border-b-2 border-ink/10 pb-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-serif text-sm font-bold tracking-wide text-duo">{article.source}</p>
                <h2 className="mt-1 font-serif text-2xl font-bold leading-snug text-ink md:text-3xl">
                  {article.title}
                </h2>
              </div>
              <button
                onClick={() => {
                  if ('speechSynthesis' in window) window.speechSynthesis.cancel()
                  clearArticle()
                  setLookup(null)
                  setPick(null)
                  setError(null)
                }}
                className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-bold text-ink-soft transition-colors hover:bg-gray-100"
              >
                <RefreshCw size={14} /> {t('press.another')}
              </button>
            </div>

            <div className="mt-2 flex flex-wrap items-center gap-3">
              {article.origin === 'live' && article.url && (
                <a
                  href={article.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-bold text-duo-blue hover:underline"
                >
                  <ExternalLink size={13} /> {t('press.openOriginal')}
                </a>
              )}
              <p className="text-xs font-semibold text-ink-soft/60">
                {article.origin === 'live'
                  ? t('press.liveDisclaimer').replace('{host}', article.source)
                  : t('press.disclaimer')}
              </p>
            </div>
          </div>

          {/* 划词提示 */}
          <p className="press-block flex items-center gap-2 rounded-xl bg-duo-blue/10 px-3 py-2 text-xs font-bold text-duo-blue-dark">
            <Search size={14} className="shrink-0" /> {t('press.selectHint')}
          </p>

          {/* 正文段落（真实外刊：原文一字未改） */}
          {article.paragraphs.map((para, i) => (
            <div key={i} className="press-block group flex flex-col gap-1.5">
              <p className="font-serif text-[17px] leading-[1.85] text-ink">{renderPara(para)}</p>
              <div className="flex items-center gap-1 opacity-60 transition-opacity group-hover:opacity-100">
                <button
                  onClick={() => toggleTrans(i)}
                  className={cn(
                    'flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold transition-colors',
                    openTrans.includes(i) ? 'bg-duo/10 text-duo' : 'text-ink-soft hover:bg-gray-100',
                  )}
                >
                  <Languages size={13} />
                  {openTrans.includes(i) ? t('press.hideTrans') : t('press.showTrans')}
                </button>
                <button
                  onClick={() => speakPara(para)}
                  className="flex cursor-pointer items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-ink-soft transition-colors hover:bg-gray-100"
                  aria-label={t('press.speakPara')}
                >
                  <Volume2 size={13} /> {t('press.speakPara')}
                </button>
              </div>
              {openTrans.includes(i) && article.translations[i] && (
                <p className="rounded-xl border-l-4 border-duo/30 bg-paper px-4 py-3 text-[15px] leading-relaxed text-ink-soft">
                  {article.translations[i]}
                </p>
              )}
            </div>
          ))}

          {/* 核心词汇表 */}
          {article.vocabulary.length > 0 && (
            <Card className="press-block mt-2 flex flex-col gap-3">
              <CardTitle className="flex items-center gap-2 text-sm text-ink-soft">
                <BookOpen size={16} className="text-duo" /> {t('press.vocab')}
                <Badge variant="gray">{article.vocabulary.length}</Badge>
              </CardTitle>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {article.vocabulary.map((v) => (
                  <div
                    key={v.word}
                    className="flex items-center justify-between gap-2 rounded-xl bg-paper px-3 py-2.5"
                  >
                    <div className="min-w-0">
                      <div className="flex items-baseline gap-1.5">
                        <span className="truncate font-serif text-base font-bold text-ink">{v.word}</span>
                        {v.pos && <span className="shrink-0 text-xs font-bold text-duo">{v.pos}</span>}
                      </div>
                      <p className="truncate text-sm text-ink-soft">{v.meaning}</p>
                    </div>
                    <button
                      onClick={() => navigate(`/add?word=${encodeURIComponent(v.word)}&auto=1`)}
                      className="flex shrink-0 cursor-pointer items-center gap-1 rounded-lg bg-duo px-2.5 py-1.5 text-xs font-bold text-white transition-transform hover:-translate-y-0.5"
                      title={t('press.addToWords')}
                    >
                      <Plus size={13} /> {t('press.addToWords')}
                    </button>
                  </div>
                ))}
              </div>
            </Card>
          )}
        </div>
      )}

      {/* ---------- 划词操作条：选中任意单词 → 查词 / 词库搜索 ---------- */}
      {pick && (
        <div
          ref={pickRef}
          className="fixed z-50 flex items-center gap-1.5 rounded-2xl border border-ink/10 bg-white p-1.5 pl-3 shadow-lift"
          style={{
            left: pickLeft,
            top: pickAbove ? pick.y - 10 : pick.y + 10,
            transform: pickAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span
            className="max-w-[8rem] truncate font-serif text-sm font-bold text-ink"
            title={pick.text}
          >
            {pick.text}
          </span>
          <button
            onClick={() => lookupAndGo(pick.text)}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-xl bg-duo px-2.5 py-1.5 text-xs font-bold text-white transition-transform duration-200 hover:-translate-y-0.5"
            title={t('press.lookupWord')}
          >
            <Search size={13} /> {t(pick.word ? 'press.lookupWord' : 'press.lookupPhrase')}
          </button>
          <button
            onClick={() => searchLibrary(pick.text)}
            className="flex shrink-0 cursor-pointer items-center gap-1 rounded-xl border border-ink/10 px-2.5 py-1.5 text-xs font-bold text-ink-soft transition-colors duration-200 hover:bg-gray-100 hover:text-ink"
            title={t('press.searchLibrary')}
          >
            <BookOpen size={13} /> {t('press.searchLibrary')}
          </button>
          <button
            onClick={() => setPick(null)}
            className="shrink-0 cursor-pointer rounded-full p-1 text-gray-400 transition-colors hover:bg-gray-100"
            aria-label={t('common.dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* ---------- 点词查义弹卡 ---------- */}
      {lookup && (
        <div
          ref={lookupRef}
          className="fixed z-50 w-56 rounded-2xl border border-ink/10 bg-white p-3 shadow-lift"
          style={{
            left: lookupLeft,
            top: lookupAbove ? lookup.y - 12 : lookup.y + 22,
            transform: lookupAbove ? 'translate(-50%, -100%)' : 'translate(-50%, 0)',
          }}
        >
          <div className="flex items-baseline gap-1.5">
            <span className="font-serif text-base font-bold text-ink">{lookup.vocab.word}</span>
            {lookup.vocab.pos && <span className="text-xs font-bold text-duo">{lookup.vocab.pos}</span>}
          </div>
          <p className="mt-1 text-sm leading-relaxed text-ink-soft">{lookup.vocab.meaning}</p>
          <button
            onClick={() => {
              navigate(`/add?word=${encodeURIComponent(lookup.vocab.word)}&auto=1`)
              setLookup(null)
            }}
            className="mt-2 flex w-full cursor-pointer items-center justify-center gap-1 rounded-xl bg-duo py-2 text-xs font-bold text-white transition-transform hover:-translate-y-0.5"
          >
            <Plus size={13} /> {t('press.addToWords')}
          </button>
        </div>
      )}
    </div>
  )
}
