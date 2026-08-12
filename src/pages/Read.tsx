import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Sparkles, X, Search, RefreshCw, Volume2, Square, Pause, Play } from 'lucide-react'
import gsap from 'gsap'
import { generateArticle, AIError } from '../services/ai'
import { useArticle } from '../stores/article'
import { useT, LANGUAGES, SPEECH_LANGS } from '../i18n'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { AILoading } from '../components/AILoading'
import { cn } from '../lib/utils'

interface Popover {
  text: string
  x: number
  y: number
}

/** 清洗选中文本：去首尾标点、只保留单个词（允许中日韩等字符） */
function sanitizeWord(raw: string): string | null {
  let w = raw.trim()
  // 去首尾非字母数字字符（。，、！？,.!?;:'"()[]「」『』…·）
  w = w.replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, '')
  if (!w || w.length > 40 || /\s/.test(w)) return null // 太长 / 含空格 → 不是单个词
  return w
}

export default function Read() {
  const navigate = useNavigate()
  const t = useT()
  const { topic, title, content, lang, savedAt, setArticle, clearArticle } = useArticle()

  const [topicInput, setTopicInput] = useState('')
  const [articleLang, setArticleLang] = useState(lang)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [popover, setPopover] = useState<Popover | null>(null)
  // 朗读状态：voiceIdx 为当前正在读的段落下标（-1 = 未播放）
  const [voiceIdx, setVoiceIdx] = useState(-1)
  const [paused, setPaused] = useState(false)

  const articleRef = useRef<HTMLDivElement>(null)
  const popRef = useRef<HTMLDivElement>(null)

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

  // 生成文章
  const handleGenerate = async () => {
    const tp = topicInput.trim()
    if (!tp) return
    stopReading()
    setLoading(true)
    setError(null)
    try {
      const article = await generateArticle(tp, articleLang)
      setArticle({ topic: tp, title: article.title, content: article.content, lang: articleLang })
    } catch (e) {
      setError(e instanceof AIError ? e.message : 'Failed to generate. Try again.')
    } finally {
      setLoading(false)
    }
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
    navigate(`/add?word=${encodeURIComponent(popover.text)}`)
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
              <AILoading label={t('read.generating')} />
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
              }}
            >
              <RefreshCw size={14} /> {t('read.newArticle')}
            </Button>
          </div>

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
            className="flex cursor-pointer items-center gap-1 rounded-xl bg-duo px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_2px_0_#46A302]"
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
    </div>
  )
}
