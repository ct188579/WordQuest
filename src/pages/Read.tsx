import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Sparkles,
  X,
  Search,
  RefreshCw,
  Volume2,
  Square,
  Pause,
  Play,
  Lightbulb,
  Globe,
  ExternalLink,
} from 'lucide-react'
import gsap from 'gsap'
import { generateArticle, suggestTopics, AIError, type TopicSuggestion } from '../services/ai'
import { searchWeb, buildSearchContext, sourceHost, SearchError } from '../services/search'
import { useArticle } from '../stores/article'
import { useSettings, type Freshness } from '../stores/settings'
import { useT, LANGUAGES, SPEECH_LANGS } from '../i18n'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { AILoading } from '../components/AILoading'
import PressReading from '../components/PressReading'
import { sanitizeWord } from '../lib/text'
import { cn } from '../lib/utils'

interface Popover {
  text: string
  x: number
  y: number
}

const FRESHNESS: { key: Freshness; labelKey: string }[] = [
  { key: 'week', labelKey: 'read.freshWeek' },
  { key: 'month', labelKey: 'read.freshMonth' },
  { key: 'year', labelKey: 'read.freshYear' },
  { key: 'any', labelKey: 'read.freshAny' },
]

/**
 * 话题推荐缓存（模块级）：
 * 阅读页跳到添加单词页再返回时会重新挂载，缓存一次避免每次回来都白花一次 AI 调用。
 */
let suggestionCache: { key: string; items: TopicSuggestion[] } | null = null

export default function Read() {
  const navigate = useNavigate()
  const t = useT()
  const { topic, title, content, lang, savedAt, sources, setArticle, clearArticle } = useArticle()
  const { interests, tavilyKey, useSearch, freshness, setUseSearch, setFreshness } = useSettings()

  const [topicInput, setTopicInput] = useState('')
  const [articleLang, setArticleLang] = useState(lang)
  const [loading, setLoading] = useState(false)
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [popover, setPopover] = useState<Popover | null>(null)
  // 阅读 Tab：'ai' = AI 生成阅读（原有功能），'press' = 外刊精读
  const [tab, setTab] = useState<'ai' | 'press'>('ai')
  // 朗读状态：voiceIdx 为当前正在读的段落下标（-1 = 未播放）
  const [voiceIdx, setVoiceIdx] = useState(-1)
  const [paused, setPaused] = useState(false)

  // ---------- AI 话题推荐 ----------
  const [suggestions, setSuggestions] = useState<TopicSuggestion[]>([])
  const [sugLoading, setSugLoading] = useState(false)

  const articleRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

  const hasSearchKey = Boolean(tavilyKey.trim())

  // 朗读文本序列：标题 + 各段落
  const paragraphs = useMemo(
    () => (content ? [title, ...content.split('\n\n')] : []),
    [title, content],
  )

  // ---------- 整篇朗读（SpeechSynthesis 顺序播放，按文章语言发音） ----------
  const speakFrom = (i: number) => {
    if (i >= paragraphs.length || !('speechSynthesis' in window)) {
      setVoiceIdx(-1)
      return
    }
    const u = new SpeechSynthesisUtterance(paragraphs[i])
    u.lang = SPEECH_LANGS[articleLang] ?? 'en-US'
    u.rate = 0.95
    const voices = window.speechSynthesis.getVoices()
    const voice =
      voices.find((v) => v.lang === u.lang) ?? voices.find((v) => v.lang.startsWith(articleLang))
    if (voice) u.voice = voice
    u.onend = () => speakFrom(i + 1)
    u.onerror = () => setVoiceIdx(-1)
    setVoiceIdx(i)
    setPaused(false)
    window.speechSynthesis.speak(u)
  }

  const stopReading = () => {
    if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    setVoiceIdx(-1)
    setPaused(false)
  }

  const togglePlay = () => {
    if (!('speechSynthesis' in window)) return
    if (paused) {
      window.speechSynthesis.resume()
      setPaused(false)
      return
    }
    if (voiceIdx >= 0) {
      window.speechSynthesis.pause()
      setPaused(true)
      return
    }
    window.speechSynthesis.cancel()
    speakFrom(0)
  }

  // 离开页面时停止朗读
  useEffect(
    () => () => {
      if ('speechSynthesis' in window) window.speechSynthesis.cancel()
    },
    [],
  )

  // ---------- 拉取话题推荐 ----------
  const loadSuggestions = useCallback(
    async (force = false) => {
      const cacheKey = `${interests}|${articleLang}`
      if (!force && suggestionCache && suggestionCache.key === cacheKey) {
        setSuggestions(suggestionCache.items)
        return
      }
      setSugLoading(true)
      try {
        const items = await suggestTopics(
          interests,
          articleLang,
          undefined,
          6,
          force ? suggestions.map((s) => s.topic) : [],
        )
        if (items.length) {
          setSuggestions(items)
          suggestionCache = { key: cacheKey, items }
        }
      } catch {
        // 推荐失败不打扰用户：输入框照常能自己填话题
      } finally {
        setSugLoading(false)
      }
    },
    [interests, articleLang, suggestions],
  )

  // 进入页面 / 切换文章语言 / 修改兴趣方向 时拉取推荐（命中缓存则不重复请求）
  // 已有文章时不打扰：等用户点「新文章」再推荐
  useEffect(() => {
    if (content || tab !== 'ai') return
    loadSuggestions(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [interests, articleLang, content, tab])

  // ---------- 生成文章（可选先联网检索） ----------
  const generate = async (rawTopic: string) => {
    const tp = rawTopic.trim()
    if (!tp) return
    stopReading()
    setLoading(true)
    setError(null)
    setNotice(null)

    // 1) 联网检索最新资料（失败自动降级为不联网，不阻塞生成）
    let context = ''
    let found: { title: string; url: string; host: string }[] = []
    if (useSearch && hasSearchKey) {
      setSearching(true)
      try {
        const results = await searchWeb(tp, { freshness, maxResults: 5 })
        if (results.length) {
          context = buildSearchContext(results)
          found = results.map((r) => ({ title: r.title, url: r.url, host: sourceHost(r.url) }))
        } else {
          setNotice(t('read.searchEmpty'))
        }
      } catch (e) {
        const msg = e instanceof SearchError ? e.message : t('read.searchFailed')
        setNotice(`${t('read.searchFailed')}（${msg}）`)
      } finally {
        setSearching(false)
      }
    }

    // 2) 带着资料写文章
    try {
      const article = await generateArticle(tp, articleLang, context)
      setArticle({
        topic: tp,
        title: article.title,
        content: article.content,
        lang: articleLang,
        sources: found,
      })
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Failed to generate. Try again.')
    } finally {
      setLoading(false)
    }
  }

  const handleGenerate = () => generate(topicInput)

  const pickSuggestion = (s: TopicSuggestion) => {
    setTopicInput(s.topic)
    generate(s.topic)
  }

  // ---------- 选中文字 → 弹出查询悬浮窗 ----------
  const handleSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.isCollapsed) {
      setPopover(null)
      return
    }
    const word = sanitizeWord(sel.toString())
    if (!word || word.length === 0) {
      setPopover(null)
      return
    }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    setPopover({ text: word, x: rect.left + rect.width / 2, y: rect.top })
  }

  // 悬浮窗入场动画
  useEffect(() => {
    if (popover && popRef.current) {
      gsap.fromTo(
        popRef.current,
        { scale: 0.6, opacity: 0 },
        { scale: 1, opacity: 1, duration: 0.28, ease: 'back.out(2)' },
      )
    }
  }, [popover])

  // 点击页面其它位置关闭悬浮窗
  useEffect(() => {
    if (!popover) return
    const onPointerDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setPopover(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [popover])

  const lookUp = () => {
    if (!popover) return
    navigate(`/add?word=${encodeURIComponent(popover.text)}&auto=1`)
    setPopover(null)
  }

  const popAbove = popover ? popover.y > 140 : true
  const popLeft = popover
    ? Math.min(Math.max(popover.x, 90), window.innerWidth - 90)
    : 0

  return (
    <div className="flex flex-col gap-5">
      <header>
        <h1 className="text-2xl font-black text-ink">{t('read.title')}</h1>
        <p className="font-bold text-ink-soft">{t('read.subtitle')}</p>
      </header>

      {/* Tab 分页：AI 生成阅读 / 外刊精读 */}
      <div className="flex gap-1 rounded-2xl bg-gray-100 p-1">
        {(['ai', 'press'] as const).map((k) => (
          <button
            key={k}
            onClick={() => {
              if (tab === k) return
              stopReading()
              setPopover(null)
              setTab(k)
            }}
            className={cn(
              'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-xl py-2.5 text-sm font-bold transition-all duration-200',
              tab === k ? 'bg-white text-ink shadow-card' : 'text-ink-soft hover:text-ink',
            )}
          >
            {k === 'ai' ? t('read.tabAi') : t('read.tabPress')}
          </button>
        ))}
      </div>

      {tab === 'ai' && (
        <>
          {/* 生成表单（无文章时显示） */}
      {!content && (
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <Input
              placeholder={t('read.topicPlaceholder')}
              value={topicInput}
              onChange={(e) => setTopicInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleGenerate()}
              className="text-lg"
            />
            <Button onClick={handleGenerate} disabled={loading || !topicInput.trim()}>
              <Sparkles size={18} />
              {!loading && t('read.generate')}
            </Button>
          </div>

          {/* AI 话题推荐：想不出话题时直接点一个 */}
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitleLike icon={Lightbulb} text={t('read.suggestTitle')} />
              <button
                onClick={() => loadSuggestions(true)}
                disabled={sugLoading}
                className="flex shrink-0 cursor-pointer items-center gap-1 rounded-xl px-2 py-1 text-xs font-extrabold text-ink-soft transition-colors hover:bg-gray-100 disabled:opacity-40"
              >
                <RefreshCw size={13} className={cn(sugLoading && 'animate-spin')} />
                {t('read.suggestRefresh')}
              </button>
            </div>

            {sugLoading && suggestions.length === 0 ? (
              <p className="py-2 text-sm font-bold text-ink-soft">{t('read.suggestLoading')}</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {suggestions.map((s) => (
                  <button
                    key={s.topic}
                    onClick={() => pickSuggestion(s)}
                    disabled={loading}
                    title={s.reason}
                    className="cursor-pointer rounded-2xl border-2 border-gray-200 bg-white px-3 py-2 text-left text-sm font-bold text-ink transition-all hover:-translate-y-0.5 hover:border-duo hover:text-duo disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {s.topic}
                  </button>
                ))}
              </div>
            )}

            <p className="text-xs font-semibold text-ink-soft">
              {interests.trim() ? t('read.suggestFromInterests') : t('read.suggestNoInterests')}{' '}
              <button
                onClick={() => navigate('/settings')}
                className="cursor-pointer font-extrabold text-duo-blue underline decoration-dotted"
              >
                {t('read.goSettings')}
              </button>
            </p>
          </Card>

          {/* 联网搜最新资料 */}
          <Card className="flex flex-col gap-3">
            <div className="flex items-center justify-between gap-2">
              <CardTitleLike icon={Globe} text={t('read.searchWeb')} />
              <button
                onClick={() => setUseSearch(!useSearch)}
                disabled={!hasSearchKey}
                aria-pressed={useSearch && hasSearchKey}
                className={cn(
                  'flex h-6 w-11 shrink-0 items-center rounded-full p-0.5 transition-colors',
                  hasSearchKey ? 'cursor-pointer' : 'cursor-not-allowed opacity-40',
                  useSearch && hasSearchKey ? 'bg-duo' : 'bg-gray-300',
                )}
              >
                <span
                  className={cn(
                    'block h-5 w-5 rounded-full bg-white transition-transform',
                    useSearch && hasSearchKey && 'translate-x-5',
                  )}
                />
              </button>
            </div>

            {hasSearchKey ? (
              <>
                <p className="text-sm font-semibold text-ink-soft">{t('read.searchDesc')}</p>
                {useSearch && (
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-xs font-extrabold uppercase text-ink-soft">
                      {t('read.freshness')}
                    </span>
                    {FRESHNESS.map((f) => (
                      <button
                        key={f.key}
                        onClick={() => setFreshness(f.key)}
                        className={cn(
                          'cursor-pointer rounded-full px-3 py-1 text-xs font-extrabold transition-colors',
                          freshness === f.key
                            ? 'bg-duo-blue text-white'
                            : 'bg-gray-100 text-ink-soft hover:bg-gray-200',
                        )}
                      >
                        {t(f.labelKey)}
                      </button>
                    ))}
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm font-semibold text-ink-soft">
                {t('read.searchNoKey')}{' '}
                <button
                  onClick={() => navigate('/settings')}
                  className="cursor-pointer font-extrabold text-duo-blue underline decoration-dotted"
                >
                  {t('read.goSettings')}
                </button>
              </p>
            )}
          </Card>

          {/* 文章语言 */}
          <div className="flex flex-col gap-1.5">
            <span className="text-xs font-extrabold uppercase text-ink-soft">
              {t('read.articleLang')}
            </span>
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <button
                  key={l.code}
                  onClick={() => setArticleLang(l.code)}
                  className={`cursor-pointer rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors ${
                    articleLang === l.code
                      ? 'bg-duo text-white'
                      : 'bg-gray-100 text-ink-soft hover:bg-gray-200'
                  }`}
                >
                  {l.native}
                </button>
              ))}
            </div>
          </div>

          {loading && (
            <Card className="flex items-center justify-center py-8">
              <AILoading label={searching ? t('read.searching') : t('read.generating')} />
            </Card>
          )}
          {error && (
            <Card className="border-duo-red bg-duo-red/5">
              <p className="text-sm font-bold text-duo-red">{error}</p>
            </Card>
          )}
        </div>
      )}

      {/* 文章（localStorage 持久化，跳转其它页面不丢失） */}
      {content && (
        <>
          <div className="flex items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-extrabold uppercase text-ink-soft">
                {savedAt ? new Date(savedAt).toLocaleString() : ''} · {topic}
              </p>
            </div>
            <div className="flex shrink-0 gap-2">
              {/* 整篇朗读控制 */}
              <Button variant="outline" size="sm" onClick={togglePlay}>
                {voiceIdx >= 0 && !paused ? <Pause size={14} /> : <Play size={14} />}
                {voiceIdx >= 0
                  ? paused
                    ? t('read.resume')
                    : t('read.pause')
                  : t('read.listen')}
              </Button>
              {voiceIdx >= 0 && (
                <Button variant="outline" size="sm" onClick={stopReading}>
                  <Square size={14} /> {t('read.stop')}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                stopReading()
                clearArticle()
                setTopicInput(topic)
                setError(null)
                setNotice(null)
              }}
            >
              <RefreshCw size={14} /> {t('read.newArticle')}
            </Button>
          </div>

          {notice && (
            <p className="rounded-xl bg-duo-yellow/15 px-3 py-2 text-xs font-bold text-duo-yellow-dark">
              {notice}
            </p>
          )}

          <Card className="relative overflow-hidden">
            {/* 提示条 */}
            <p className="mb-4 flex items-center gap-2 rounded-xl bg-duo-blue/10 px-3 py-2 text-xs font-bold text-duo-blue-dark">
              <Search size={14} /> {t('read.selectHint')}
            </p>

            <div
              ref={articleRef}
              className="select-text cursor-text space-y-4"
              onMouseUp={handleSelection}
              onTouchEnd={handleSelection}
            >
              <h2
                className={cn(
                  'rounded-xl px-2 py-1 -mx-2 text-2xl font-black leading-snug text-ink transition-colors',
                  voiceIdx === 0 && 'bg-duo-yellow/25',
                )}
              >
                {title}
              </h2>
              {content.split('\n\n').map((para, i) => (
                <p
                  key={i}
                  className={cn(
                    '-mx-2 rounded-xl px-2 py-1 text-[15px] leading-7 font-medium text-ink transition-colors',
                    voiceIdx === i + 1 && 'bg-duo-yellow/25',
                  )}
                >
                  {para}
                </p>
              ))}
            </div>
            {voiceIdx >= 0 && (
              <p className="mt-3 flex items-center gap-1.5 text-xs font-bold text-duo-blue-dark">
                <Volume2 size={13} />
                {voiceIdx + 1} / {paragraphs.length}
              </p>
            )}
          </Card>

          {/* 参考来源（联网检索到的资料） */}
          {sources.length > 0 && (
            <Card className="flex flex-col gap-2">
              <CardTitleLike icon={Globe} text={`${t('read.sources')} · ${sources.length}`} />
              <ul className="flex flex-col gap-1.5">
                {sources.map((s) => (
                  <li key={s.url}>
                    <a
                      href={s.url}
                      target="_blank"
                      rel="noreferrer"
                      className="flex items-start gap-1.5 text-sm font-bold text-duo-blue-dark hover:underline"
                    >
                      <ExternalLink size={13} className="mt-1 shrink-0" />
                      <span className="min-w-0">
                        <span className="text-ink">{s.title}</span>
                        <span className="ml-1 text-xs font-semibold text-ink-soft">· {s.host}</span>
                      </span>
                    </a>
                  </li>
                ))}
              </ul>
            </Card>
          )}
        </>
      )}

      {/* 查询悬浮窗 */}
      {popover && (
        <div
          ref={popRef}
          className="fixed z-50 flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white p-2 shadow-xl"
          style={{
            left: popLeft,
            top: popAbove ? popover.y - 8 : popover.y + 8,
            transform: `translateX(-50%) ${popAbove ? 'translateY(-100%)' : ''}`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="pl-2 text-sm font-black text-ink">{popover.text}</span>
          <button
            onClick={lookUp}
            className="flex cursor-pointer items-center gap-1 rounded-lg bg-duo px-3 py-1.5 text-xs font-semibold text-white shadow-btn transition-colors duration-200 hover:bg-duo-light"
          >
            <Search size={12} /> {t('read.lookup')}
          </button>
          <button
            onClick={() => setPopover(null)}
            className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100"
            aria-label={t('common.dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      )}
        </>
      )}

      {tab === 'press' && <PressReading />}
    </div>
  )
}

/** 卡片小标题（图标 + 文字），避免每处重复写样式 */
function CardTitleLike({ icon: Icon, text }: { icon: typeof Globe; text: string }) {
  return (
    <span className="flex items-center gap-2 text-sm font-black text-ink">
      <Icon size={16} className="text-duo-blue" />
      {text}
    </span>
  )
}
