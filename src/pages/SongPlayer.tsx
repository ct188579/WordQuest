import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  ArrowLeft,
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Repeat,
  BookMarked,
  Search,
  X,
  Music2,
} from 'lucide-react'
import { fetchSong } from '../services/songs'
import { parseLrc, activeLineIndex, formatTime, type LrcLine } from '../lib/lrc'
import { sanitizeWord } from '../lib/text'
import { useT } from '../i18n'
import type { Song } from '../types'
import { Button } from '../components/ui/button'
import { cn } from '../lib/utils'

const RATES = [0.5, 0.75, 1, 1.25, 1.5]

interface Lookup {
  text: string
  x: number
  y: number
}

export default function SongPlayer() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const t = useT()

  const [song, setSong] = useState<Song | null>(null)
  const [lines, setLines] = useState<LrcLine[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)

  const [playing, setPlaying] = useState(false)
  const [current, setCurrent] = useState(0)
  const [duration, setDuration] = useState(0)
  const [rate, setRate] = useState(1)
  const [loopLine, setLoopLine] = useState(false)
  const [lookupMode, setLookupMode] = useState(false)
  const [lookup, setLookup] = useState<Lookup | null>(null)

  const audioRef = useRef<HTMLAudioElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const lineRefs = useRef<(HTMLParagraphElement | null)[]>([])
  const popRef = useRef<HTMLDivElement>(null)
  // 供 timeupdate 回调读取最新值，避免闭包过期
  const linesRef = useRef<LrcLine[]>([])
  const loopRef = useRef(false)
  linesRef.current = lines
  loopRef.current = loopLine

  // ---------- 加载歌曲 + 歌词 ----------
  useEffect(() => {
    if (!id) return
    let cancelled = false
    fetchSong(id)
      .then(async ({ song, audioUrl, lrcUrl }) => {
        if (cancelled) return
        setSong(song)
        const audio = audioRef.current
        if (audio) {
          audio.src = audioUrl
          audio.load()
        }
        const text = await fetch(lrcUrl).then((r) => r.text())
        if (!cancelled) setLines(parseLrc(text))
      })
      .catch((e) => !cancelled && setLoadError(e instanceof Error ? e.message : 'Failed to load'))
    return () => {
      cancelled = true
    }
  }, [id])

  // ---------- 音频事件 ----------
  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    const onTime = () => {
      const ct = audio.currentTime
      setCurrent(ct)
      // 单句循环：到下一行前回到本行开头
      const ls = linesRef.current
      if (loopRef.current && ls.length > 0) {
        const idx = activeLineIndex(ls, ct)
        const next = ls[idx + 1]
        if (idx >= 0 && next && ct >= next.time - 0.08) {
          audio.currentTime = ls[idx].time
        }
      }
    }
    const onMeta = () => setDuration(audio.duration)
    const onEnd = () => setPlaying(false)
    const onPlay = () => setPlaying(true)
    const onPause = () => setPlaying(false)

    audio.addEventListener('timeupdate', onTime)
    audio.addEventListener('loadedmetadata', onMeta)
    audio.addEventListener('ended', onEnd)
    audio.addEventListener('play', onPlay)
    audio.addEventListener('pause', onPause)
    return () => {
      audio.removeEventListener('timeupdate', onTime)
      audio.removeEventListener('loadedmetadata', onMeta)
      audio.removeEventListener('ended', onEnd)
      audio.removeEventListener('play', onPlay)
      audio.removeEventListener('pause', onPause)
    }
  }, [])

  // 变速
  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = rate
  }, [rate])

  const activeIdx = activeLineIndex(lines, current)

  // 自动滚动：当前行居中（Apple Music 风格平滑滚动）
  useEffect(() => {
    const el = lineRefs.current[activeIdx]
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' })
  }, [activeIdx])

  // 点击弹窗外关闭查词悬浮窗
  useEffect(() => {
    if (!lookup) return
    const onPointerDown = (e: PointerEvent) => {
      if (popRef.current && !popRef.current.contains(e.target as Node)) setLookup(null)
    }
    document.addEventListener('pointerdown', onPointerDown)
    return () => document.removeEventListener('pointerdown', onPointerDown)
  }, [lookup])

  const togglePlay = () => {
    const audio = audioRef.current
    if (!audio) return
    if (audio.paused) audio.play().catch(console.error)
    else audio.pause()
  }

  /** 跳到第 n 行并播放 */
  const seekLine = useCallback(
    (n: number) => {
      const audio = audioRef.current
      if (!audio || lines.length === 0) return
      const target = Math.min(Math.max(n, 0), lines.length - 1)
      audio.currentTime = lines[target].time
      if (audio.paused) audio.play().catch(console.error)
    },
    [lines],
  )

  /** 进度条点击跳转 */
  const seekByClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audio = audioRef.current
    if (!audio || !duration) return
    const rect = e.currentTarget.getBoundingClientRect()
    audio.currentTime = ((e.clientX - rect.left) / rect.width) * duration
  }

  /** 查词模式：点击单词弹悬浮窗 */
  const openLookup = (raw: string, e: React.MouseEvent) => {
    const w = sanitizeWord(raw)
    if (!w) return
    e.stopPropagation()
    setLookup({ text: w.toLowerCase(), x: e.clientX, y: e.clientY })
  }

  const goAdd = () => {
    if (!lookup) return
    navigate(`/add?word=${encodeURIComponent(lookup.text)}`)
    setLookup(null)
  }

  const popAbove = lookup ? lookup.y > 160 : true
  const popLeft = lookup ? Math.min(Math.max(lookup.x, 100), window.innerWidth - 100) : 0

  if (loadError) {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Music2 size={48} className="text-gray-300" />
        <p className="font-bold text-ink-soft">{loadError}</p>
        <Button variant="outline" onClick={() => navigate('/songs')}>
          <ArrowLeft size={16} /> {t('common.back')}
        </Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      <audio ref={audioRef} preload="metadata" />

      {/* 顶部：返回 + 歌名 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => navigate('/songs')}>
          <ArrowLeft size={18} /> {t('common.back')}
        </Button>
        <div className="min-w-0">
          <h1 className="truncate text-xl font-black text-ink">{song?.title ?? '…'}</h1>
          <p className="text-sm font-bold text-ink-soft">{song?.artist ?? ''}</p>
        </div>
      </div>

      {/* 歌词区（可滚动，当前行高亮居中） */}
      <div
        ref={listRef}
        className="h-[46vh] overflow-y-auto rounded-3xl border-2 border-gray-200 bg-paper/60 px-6 py-[22vh]"
      >
        {lines.length === 0 ? (
          <p className="text-center font-bold text-ink-soft">{t('common.loading')}</p>
        ) : (
          lines.map((line, i) => {
            const isActive = i === activeIdx
            return (
              <p
                key={i}
                ref={(el) => {
                  lineRefs.current[i] = el
                }}
                onClick={() => !lookupMode && seekLine(i)}
                className={cn(
                  'my-1 origin-left cursor-pointer rounded-xl px-3 py-2 text-lg font-black transition-all duration-300',
                  isActive
                    ? 'scale-[1.06] text-duo'
                    : lookupMode
                      ? 'text-ink-soft hover:text-ink'
                      : 'text-ink-soft/60 hover:text-ink-soft',
                )}
              >
                {lookupMode
                  ? // 查词模式：逐词可点
                    line.text.split(/(\s+)/).map((tok, j) =>
                      /\s/.test(tok) ? (
                        tok
                      ) : (
                        <span
                          key={j}
                          onClick={(e) => openLookup(tok, e)}
                          className="rounded px-0.5 transition-colors hover:bg-duo-yellow/30 hover:text-ink"
                        >
                          {tok}
                        </span>
                      ),
                    )
                  : line.text}
              </p>
            )
          })
        )}
      </div>

      {/* 查词悬浮窗 */}
      {lookup && (
        <div
          ref={popRef}
          className="fixed z-50 flex items-center gap-2 rounded-2xl border-2 border-gray-200 bg-white p-2 shadow-xl"
          style={{
            left: popLeft,
            top: popAbove ? lookup.y - 8 : lookup.y + 8,
            transform: `translateX(-50%) ${popAbove ? 'translateY(-100%)' : ''}`,
          }}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <span className="pl-2 text-sm font-black text-ink">{lookup.text}</span>
          <button
            onClick={goAdd}
            className="flex cursor-pointer items-center gap-1 rounded-xl bg-duo px-3 py-1.5 text-xs font-extrabold text-white shadow-[0_2px_0_#46A302]"
          >
            <Search size={12} /> {t('song.lookupGo')}
          </button>
          <button
            onClick={() => setLookup(null)}
            className="cursor-pointer rounded-full p-1 text-gray-400 hover:bg-gray-100"
            aria-label={t('common.dismiss')}
          >
            <X size={14} />
          </button>
        </div>
      )}

      {/* 进度条 */}
      <div className="flex items-center gap-3">
        <span className="w-10 text-right text-xs font-extrabold text-ink-soft">{formatTime(current)}</span>
        <div
          className="h-3.5 flex-1 cursor-pointer overflow-hidden rounded-full bg-gray-200"
          onClick={seekByClick}
        >
          <div
            className="h-full rounded-full bg-duo transition-[width] duration-150"
            style={{ width: duration ? `${(current / duration) * 100}%` : 0 }}
          />
        </div>
        <span className="w-10 text-xs font-extrabold text-ink-soft">{formatTime(duration)}</span>
      </div>

      {/* 播放控制：上一句 / 播放暂停 / 下一句 */}
      <div className="flex items-center justify-center gap-5">
        <button
          onClick={() => seekLine(activeIdx - 1)}
          className="cursor-pointer rounded-full p-2.5 text-ink-soft transition-colors hover:bg-gray-100 hover:text-ink"
          aria-label="previous line"
        >
          <SkipBack size={22} />
        </button>
        <button
          onClick={togglePlay}
          className="flex h-16 w-16 cursor-pointer items-center justify-center rounded-full bg-duo text-white shadow-[0_5px_0_#46A302] transition-transform hover:-translate-y-0.5 active:translate-y-0.5"
          aria-label="play/pause"
        >
          {playing ? <Pause size={26} fill="currentColor" /> : <Play size={26} fill="currentColor" className="ml-1" />}
        </button>
        <button
          onClick={() => seekLine(activeIdx + 1)}
          className="cursor-pointer rounded-full p-2.5 text-ink-soft transition-colors hover:bg-gray-100 hover:text-ink"
          aria-label="next line"
        >
          <SkipForward size={22} />
        </button>
      </div>

      {/* 变速 + 单句循环 + 查词 */}
      <div className="flex flex-wrap items-center justify-center gap-2">
        {RATES.map((r) => (
          <button
            key={r}
            onClick={() => setRate(r)}
            className={cn(
              'cursor-pointer rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors',
              rate === r ? 'bg-duo text-white' : 'bg-gray-100 text-ink-soft hover:bg-gray-200',
            )}
          >
            {r}x
          </button>
        ))}
        <span className="mx-1 h-5 w-0.5 bg-gray-200" />
        <button
          onClick={() => setLoopLine((v) => !v)}
          title={t('song.loop')}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors',
            loopLine ? 'bg-duo-yellow text-ink' : 'bg-gray-100 text-ink-soft hover:bg-gray-200',
          )}
        >
          <Repeat size={13} /> {t('song.loop')}
        </button>
        <button
          onClick={() => setLookupMode((v) => !v)}
          title={t('song.lookup')}
          className={cn(
            'flex cursor-pointer items-center gap-1 rounded-full px-3 py-1.5 text-xs font-extrabold transition-colors',
            lookupMode ? 'bg-duo-blue text-white' : 'bg-gray-100 text-ink-soft hover:bg-gray-200',
          )}
        >
          <BookMarked size={13} /> {t('song.lookup')}
        </button>
      </div>
      {lookupMode && (
        <p className="text-center text-xs font-bold text-duo-blue-dark">{t('song.lookupHint')}</p>
      )}
    </div>
  )
}
