import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { RotateCw } from 'lucide-react'
import gsap from 'gsap'
import { fetchDueWords, submitReview } from '../services/review'
import { fetchBooks } from '../services/books'
import { useT } from '../i18n'
import type { Feedback, Word } from '../types'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { SpeakButton } from '../components/SpeakButton'
import { Celebration } from '../components/Celebration'

type Phase = 'loading' | 'reviewing' | 'done' | 'empty'

export default function Review() {
  const navigate = useNavigate()
  const t = useT()
  const [phase, setPhase] = useState<Phase>('loading')
  const [queue, setQueue] = useState<Word[]>([])
  const [index, setIndex] = useState(0)
  const [flipped, setFlipped] = useState(false)
  const [celebrating, setCelebrating] = useState(false)
  // 单词本 id → 语言 映射，喇叭按所属单词本的语言发音
  const [bookLangs, setBookLangs] = useState<Record<string, string>>({})

  const cardRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDueWords()
      .then((words) => {
        setQueue(words)
        setPhase(words.length ? 'reviewing' : 'empty')
      })
      .catch(() => setPhase('empty'))
    fetchBooks()
      .then((list) => setBookLangs(Object.fromEntries(list.map((b) => [b.id, b.language]))))
      .catch(() => {})
  }, [])

  const current: Word | undefined = queue[index]
  const wordLang = current?.book_id ? (bookLangs[current.book_id] ?? 'en') : 'en'

  // 换卡片时的入场动画
  useEffect(() => {
    if (phase !== 'reviewing' || !cardRef.current) return
    gsap.fromTo(
      cardRef.current,
      { x: 60, opacity: 0, rotation: 2 },
      { x: 0, opacity: 1, rotation: 0, duration: 0.4, ease: 'back.out(1.4)' },
    )
  }, [index, phase])

  /** GSAP 3D 翻转 */
  const flip = useCallback((to: boolean) => {
    if (!cardRef.current) return
    gsap.to(cardRef.current, {
      rotationY: to ? 180 : 0,
      duration: 0.55,
      ease: 'power2.inOut',
    })
    setFlipped(to)
  }, [])

  /** 提交反馈：颜色闪屏 + 卡片飞出 + 下一步 */
  const handleFeedback = async (feedback: Feedback) => {
    if (!current) return

    // 全屏颜色反馈
    const colors: Record<Feedback, string> = {
      know: 'rgba(88, 204, 2, 0.18)',
      fuzzy: 'rgba(255, 200, 0, 0.22)',
      forgot: 'rgba(255, 75, 75, 0.18)',
    }
    if (flashRef.current) {
      gsap.fromTo(
        flashRef.current,
        { opacity: 0.9, backgroundColor: colors[feedback] },
        { opacity: 0, duration: 0.6, ease: 'power2.out' },
      )
    }
    // 答对小庆祝
    if (feedback === 'know') {
      setCelebrating(true)
      setTimeout(() => setCelebrating(false), 1200)
    }

    try {
      await submitReview(current, feedback)
    } catch (e) {
      console.error(e)
    }

    // forgot / fuzzy 的词重新排到队尾，本轮再见一次
    const nextQueue = [...queue]
    if (feedback !== 'know') nextQueue.push(current)

    // 卡片飞出，然后切换
    if (cardRef.current) {
      await gsap.to(cardRef.current, {
        x: feedback === 'know' ? 300 : -300,
        opacity: 0,
        rotation: feedback === 'know' ? 8 : -8,
        duration: 0.3,
        ease: 'power2.in',
      })
      gsap.set(cardRef.current, { rotationY: 0, x: 0 })
    }
    setFlipped(false)

    if (index + 1 >= nextQueue.length) {
      setQueue(nextQueue)
      setPhase('done')
    } else {
      setQueue(nextQueue)
      setIndex(index + 1)
    }
  }

  if (phase === 'loading') {
    return <p className="py-20 text-center font-bold text-ink-soft">{t('review.loading')}</p>
  }

  if (phase === 'empty') {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <span className="text-6xl">🌤️</span>
        <h1 className="text-2xl font-black text-ink">{t('review.emptyTitle')}</h1>
        <p className="font-bold text-ink-soft">{t('review.emptyMsg')}</p>
        <Button onClick={() => navigate('/add')}>{t('review.emptyAdd')}</Button>
      </div>
    )
  }

  if (phase === 'done') {
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Celebration count={24} />
        <span className="text-6xl">🏆</span>
        <h1 className="text-2xl font-black text-ink">{t('review.doneTitle')}</h1>
        <p className="font-bold text-ink-soft">
          {queue.length} {t('review.doneMsg')}
        </p>
        <Button onClick={() => navigate('/')}>{t('review.doneBack')}</Button>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-5">
      {celebrating && <Celebration count={10} />}
      {/* 全屏颜色反馈层 */}
      <div ref={flashRef} className="pointer-events-none fixed inset-0 z-40 opacity-0" />

      <header className="mx-auto flex w-full max-w-xl items-center justify-between">
        <h1 className="text-xl font-black text-ink">{t('review.title')}</h1>
        <span className="font-extrabold text-ink-soft">
          {index + 1} / {queue.length}
        </span>
      </header>
      <div className="mx-auto w-full max-w-xl">
        <Progress value={(index + 1) / queue.length} />
      </div>

      {/* 翻转卡片 */}
      <div className="perspective-1000 mx-auto w-full max-w-xl" onClick={() => flip(!flipped)}>
        <div ref={cardRef} className="preserve-3d relative h-96 w-full cursor-pointer">
          {/* 正面 */}
          <Card className="backface-hidden absolute inset-0 flex flex-col items-center justify-center gap-3 border-duo-blue/40">
            <span className="text-4xl font-black text-ink">{current?.word}</span>
            {/* 音标 + 喇叭朗读（按单词本语言发音，点喇叭不触发翻转） */}
            <span className="flex items-center gap-1.5 text-lg font-bold text-ink-soft">
              <SpeakButton text={current?.word ?? ''} lang={wordLang} size={18} />
              {current?.phonetic}
            </span>
            {current?.part_of_speech && <Badge variant="blue">{current.part_of_speech}</Badge>}
            <p className="mt-4 flex items-center gap-1 text-sm font-bold text-gray-400">
              <RotateCw size={14} /> {t('review.tapFlip')}
            </p>
          </Card>
          {/* 背面 */}
          <Card
            className="backface-hidden absolute inset-0 flex flex-col gap-3 overflow-y-auto border-duo/40 p-5"
            style={{ transform: 'rotateY(180deg)' }}
          >
            <p className="text-lg font-black text-ink">{current?.meaning_cn}</p>
            <p className="text-sm font-semibold text-ink-soft">{current?.meaning_en}</p>
            <div className="mt-1 flex flex-col gap-2">
              {current?.example_sentences.slice(0, 2).map((ex, i) => (
                <div key={i} className="rounded-xl bg-paper p-2.5">
                  <p className="text-sm font-bold text-ink">{ex.en}</p>
                  <p className="text-xs text-ink-soft">{ex.cn}</p>
                </div>
              ))}
            </div>
          </Card>
        </div>
      </div>

      {/* 反馈按钮 */}
      <div className="mx-auto grid w-full max-w-xl grid-cols-3 gap-3">
        <Button
          variant="danger"
          size="lg"
          disabled={!flipped}
          onClick={() => handleFeedback('forgot')}
        >
          {t('review.forgot')}
        </Button>
        <Button
          variant="warning"
          size="lg"
          disabled={!flipped}
          onClick={() => handleFeedback('fuzzy')}
        >
          {t('review.fuzzy')}
        </Button>
        <Button
          variant="primary"
          size="lg"
          disabled={!flipped}
          onClick={() => handleFeedback('know')}
        >
          {t('review.know')}
        </Button>
      </div>
      {!flipped && (
        <p className="text-center text-sm font-bold text-gray-400">{t('review.flipFirst')}</p>
      )}
      <div className="text-center">
        <Button variant="ghost" size="sm" onClick={() => navigate(`/words/${current?.id}`)}>
          {t('review.viewDetail')}
        </Button>
      </div>
    </div>
  )
}
