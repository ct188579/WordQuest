import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Layers, Sparkles, ChevronRight, Settings2 } from 'lucide-react'
import gsap from 'gsap'
import {
  fetchDueWords,
  fetchNewWords,
  fetchDistractorPool,
  submitStudyResult,
  meaningOf,
  pickDistractors,
} from '../services/study'
import { fetchBooks } from '../services/books'
import { useSettings } from '../stores/settings'
import { useT } from '../i18n'
import type { BookWithCount } from '../services/books'
import type { Word } from '../types'
import { Button } from '../components/ui/button'
import { Card } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Badge } from '../components/ui/badge'
import { SpeakButton } from '../components/SpeakButton'
import { Celebration } from '../components/Celebration'

type Phase = 'loading' | 'select' | 'learn' | 'quiz' | 'done' | 'empty'

/** 洗牌（Fisher–Yates），返回新数组 */
function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export default function Study() {
  const navigate = useNavigate()
  const t = useT()
  const dailyNewWords = useSettings((s) => s.dailyNewWords)

  const [phase, setPhase] = useState<Phase>('loading')
  const [books, setBooks] = useState<BookWithCount[]>([])
  const [bookId, setBookId] = useState<string | null>(null) // null = 全部词库
  const [dueCount, setDueCount] = useState(0)
  const [newCount, setNewCount] = useState(0)

  // session 内数据
  const [learnWords, setLearnWords] = useState<Word[]>([])
  const [learnIndex, setLearnIndex] = useState(0)
  const [quizQueue, setQuizQueue] = useState<Word[]>([])
  const [quizIndex, setQuizIndex] = useState(0)
  const [picked, setPicked] = useState<string | null>(null)
  const [locked, setLocked] = useState(false)
  const [bookLangs, setBookLangs] = useState<Record<string, string>>({})
  const [celebrating, setCelebrating] = useState(false)

  // 结算统计
  const statsRef = useRef({ quizTotal: 0, quizCorrect: 0 })

  const cardRef = useRef<HTMLDivElement>(null)
  const flashRef = useRef<HTMLDivElement>(null)
  const bookIdRef = useRef(bookId)
  bookIdRef.current = bookId

  // 首屏：加载单词本 + 默认范围的数量
  useEffect(() => {
    fetchBooks()
      .then((list) => {
        setBooks(list)
        setBookLangs(Object.fromEntries(list.map((b) => [b.id, b.language])))
      })
      .catch(() => {})
  }, [])

  // 范围变化 → 刷新两个数量
  useEffect(() => {
    if (phase !== 'select' && phase !== 'loading') return
    setPhase('loading')
    Promise.all([fetchDueWords(bookId), fetchNewWords(bookId)])
      .then(([due, fresh]) => {
        setDueCount(due.length)
        setNewCount(fresh.length)
        setPhase('select')
      })
      .catch(() => setPhase('select'))
  }, [bookId, phase])

  const current: Word | undefined = quizQueue[quizIndex]
  const wordLang = current?.book_id ? (bookLangs[current.book_id] ?? 'en') : 'en'

  // 干扰项素材池用 ref 存，避免进 useMemo 依赖
  const distractorPoolRef = useRef<Word[]>([])

  // 选项：当前词 + 干扰释义，洗牌
  const options = useMemo(() => {
    if (!current) return []
    const distractors = pickDistractors(current, distractorPoolRef.current, 3)
    return shuffle([meaningOf(current), ...distractors])
  }, [current, quizIndex])

  // 练习卡片入场动画
  useEffect(() => {
    if (phase !== 'quiz' || !cardRef.current) return
    gsap.fromTo(
      cardRef.current,
      { x: 60, opacity: 0 },
      { x: 0, opacity: 1, duration: 0.35, ease: 'back.out(1.4)' },
    )
  }, [quizIndex, phase])

  // 新词学习卡入场动画
  useEffect(() => {
    if (phase !== 'learn' || !cardRef.current) return
    gsap.fromTo(
      cardRef.current,
      { y: 40, opacity: 0 },
      { y: 0, opacity: 1, duration: 0.4, ease: 'back.out(1.4)' },
    )
  }, [learnIndex, phase])

  /** 开始一轮：拉新词 + 到期词 + 干扰项池，决定进哪个阶段 */
  const startSession = async () => {
    setPhase('loading')
    const bid = bookIdRef.current
    const [fresh, due, pool] = await Promise.all([
      fetchNewWords(bid),
      fetchDueWords(bid),
      fetchDistractorPool(bid).catch(() => [] as Word[]),
    ])
    distractorPoolRef.current = pool

    const pickedNew = fresh.slice(0, dailyNewWords)
    statsRef.current = { quizTotal: 0, quizCorrect: 0 }
    setLearnWords(pickedNew)
    setLearnIndex(0)
    setQuizQueue(shuffle([...pickedNew, ...due]))
    setQuizIndex(0)
    setPicked(null)
    setLocked(false)

    if (pickedNew.length === 0 && due.length === 0) {
      setPhase('empty')
    } else if (pickedNew.length > 0) {
      setPhase('learn')
    } else {
      setPhase('quiz')
    }
  }

  /** 学习阶段：下一张 / 进入练习 */
  const nextLearn = () => {
    if (learnIndex + 1 >= learnWords.length) {
      setPhase('quiz')
    } else {
      setLearnIndex(learnIndex + 1)
    }
  }

  /** 答题：判分 + 提交 + 动画 + 推进 */
  const handleAnswer = async (choice: string) => {
    if (!current || locked) return
    setLocked(true)
    setPicked(choice)

    const correct = choice === meaningOf(current)
    statsRef.current.quizTotal += 1
    if (correct) {
      statsRef.current.quizCorrect += 1
      setCelebrating(true)
      setTimeout(() => setCelebrating(false), 1000)
    }

    // 全屏颜色反馈
    if (flashRef.current) {
      gsap.fromTo(
        flashRef.current,
        { opacity: 0.9, backgroundColor: correct ? 'rgba(88, 204, 2, 0.18)' : 'rgba(255, 75, 75, 0.18)' },
        { opacity: 0, duration: 0.6, ease: 'power2.out' },
      )
    }
    // 选错的选项抖一下
    if (!correct && cardRef.current) {
      gsap.fromTo(
        cardRef.current,
        { x: -8 },
        { x: 0, duration: 0.4, ease: 'elastic.out(1.5, 0.3)' },
      )
    }

    try {
      await submitStudyResult(current, correct)
    } catch (e) {
      console.error(e)
    }

    const nextQueue = [...quizQueue]
    if (!correct) nextQueue.push(current) // 答错 → 排到队尾再来一次

    // 停留片刻让用户看到对错，再切下一张
    setTimeout(async () => {
      if (cardRef.current) {
        await gsap.to(cardRef.current, {
          x: correct ? 300 : -300,
          opacity: 0,
          duration: 0.25,
          ease: 'power2.in',
        })
        gsap.set(cardRef.current, { x: 0 })
      }
      setPicked(null)
      setLocked(false)

      if (quizIndex + 1 >= nextQueue.length) {
        setQuizQueue(nextQueue)
        setPhase('done')
      } else {
        setQuizQueue(nextQueue)
        setQuizIndex(quizIndex + 1)
      }
    }, correct ? 650 : 1400)
  }

  // ============ 渲染 ============

  if (phase === 'loading') {
    return <p className="py-20 text-center font-bold text-ink-soft">{t('study.loading')}</p>
  }

  // ---- 选择范围 ----
  if (phase === 'select') {
    const nothing = dueCount === 0 && newCount === 0
    return (
      <div className="flex flex-col gap-5">
        <header className="mx-auto flex w-full max-w-xl items-center gap-2">
          <Layers className="text-duo" size={22} />
          <h1 className="text-xl font-black text-ink">{t('study.title')}</h1>
        </header>

        {/* 单词本范围 */}
        <Card className="mx-auto flex w-full max-w-xl flex-col gap-3 p-4">
          <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
            {t('study.book')}
          </span>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setBookId(null)}
              className={`cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-extrabold transition-colors ${
                bookId === null
                  ? 'border-duo bg-duo/10 text-duo-dark'
                  : 'border-gray-200 text-ink-soft hover:border-gray-300'
              }`}
            >
              {t('study.bookAll')}
            </button>
            {books.map((b) => (
              <button
                key={b.id}
                onClick={() => setBookId(b.id)}
                className={`cursor-pointer rounded-full border-2 px-4 py-2 text-sm font-extrabold transition-colors ${
                  bookId === b.id
                    ? 'border-duo bg-duo/10 text-duo-dark'
                    : 'border-gray-200 text-ink-soft hover:border-gray-300'
                }`}
              >
                {b.name} · {b.word_count}
              </button>
            ))}
          </div>
        </Card>

        {nothing ? (
          <div className="flex flex-col items-center gap-4 py-10 text-center">
            <span className="text-6xl">🌤️</span>
            <h2 className="text-2xl font-black text-ink">{t('study.emptyTitle')}</h2>
            <p className="font-bold text-ink-soft">{t('study.emptyMsg')}</p>
            <Button onClick={() => navigate('/add')}>{t('study.emptyAdd')}</Button>
          </div>
        ) : (
          <Card className="mx-auto flex w-full max-w-xl flex-col gap-3 border-duo/40 bg-duo/5 p-5">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-extrabold text-ink">
                <Sparkles size={18} className="text-duo-yellow-dark" /> {t('study.new')}
              </span>
              <span className="font-black text-duo-dark">{newCount}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-2 font-extrabold text-ink">
                <Layers size={18} className="text-duo" /> {t('study.due')}
              </span>
              <span className="font-black text-duo-dark">{dueCount}</span>
            </div>
            <Button className="mt-1" size="lg" onClick={startSession}>
              {t('study.start')} <ChevronRight size={18} />
            </Button>
            <button
              onClick={() => navigate('/settings')}
              className="flex cursor-pointer items-center justify-center gap-1 text-xs font-bold text-gray-400 hover:text-ink-soft"
            >
              <Settings2 size={12} />
              {t('study.newWordsNote').replace('{n}', String(dailyNewWords))}
            </button>
          </Card>
        )}
      </div>
    )
  }

  // ---- 学新词 ----
  if (phase === 'learn') {
    const w = learnWords[learnIndex]
    return (
      <div className="flex flex-col gap-5">
        <header className="mx-auto flex w-full max-w-xl items-center justify-between">
          <span className="flex items-center gap-2 text-sm font-extrabold uppercase tracking-wide text-duo-dark">
            <Sparkles size={16} /> {t('study.learnPhase')}
          </span>
          <span className="font-extrabold text-ink-soft">
            {learnIndex + 1} / {learnWords.length}
          </span>
        </header>
        <div className="mx-auto w-full max-w-xl">
          <Progress value={((learnIndex + 1) / learnWords.length) * 100} />
        </div>

        <div className="mx-auto w-full max-w-xl">
          <div ref={cardRef}>
            <Card className="flex min-h-96 flex-col items-center justify-center gap-3 border-duo-yellow/40 p-6">
              <span className="text-4xl font-black text-ink">{w?.word}</span>
              <span className="flex items-center gap-1.5 text-lg font-bold text-ink-soft">
                <SpeakButton text={w?.word ?? ''} lang={bookLangs[w?.book_id ?? ''] ?? 'en'} size={18} />
                {w?.phonetic}
              </span>
              {w?.part_of_speech && <Badge variant="blue">{w.part_of_speech}</Badge>}
              <p className="text-xl font-black text-duo-dark">{w?.meaning_cn}</p>
              {w?.meaning_en && <p className="text-sm font-semibold text-ink-soft">{w.meaning_en}</p>}
              <div className="mt-2 flex w-full flex-col gap-2">
                {w?.example_sentences.slice(0, 2).map((ex, i) => (
                  <div key={i} className="rounded-xl bg-paper p-2.5">
                    <p className="text-sm font-bold text-ink">{ex.en}</p>
                    <p className="text-xs text-ink-soft">{ex.cn}</p>
                  </div>
                ))}
              </div>
            </Card>
          </div>
          <Button className="mt-5 w-full" size="lg" onClick={nextLearn}>
            {learnIndex + 1 >= learnWords.length ? t('study.startQuiz') : t('study.continue')}
          </Button>
        </div>
      </div>
    )
  }

  // ---- 练习 ----
  if (phase === 'quiz') {
    return (
      <div className="flex flex-col gap-5">
        {celebrating && <Celebration count={10} />}
        <div ref={flashRef} className="pointer-events-none fixed inset-0 z-40 opacity-0" />

        <header className="mx-auto flex w-full max-w-xl items-center justify-between">
          <h1 className="text-xl font-black text-ink">{t('study.quizPrompt')}</h1>
          <span className="font-extrabold text-ink-soft">
            {quizIndex + 1} / {quizQueue.length}
          </span>
        </header>
        <div className="mx-auto w-full max-w-xl">
          <Progress value={((quizIndex + 1) / quizQueue.length) * 100} />
        </div>

        <div className="mx-auto w-full max-w-xl">
          <div ref={cardRef}>
            <Card className="flex min-h-40 flex-col items-center justify-center gap-2 border-duo-blue/40 p-6">
              <span className="text-4xl font-black text-ink">{current?.word}</span>
              <span className="flex items-center gap-1.5 text-base font-bold text-ink-soft">
                <SpeakButton text={current?.word ?? ''} lang={wordLang} size={18} />
                {current?.phonetic}
              </span>
            </Card>
          </div>
        </div>

        <div className="mx-auto grid w-full max-w-xl grid-cols-1 gap-3 sm:grid-cols-2">
          {options.map((opt) => {
            const isAnswer = current ? opt === meaningOf(current) : false
            const isPicked = picked === opt
            let variant: 'primary' | 'danger' | 'outline' = 'outline'
            if (picked) {
              if (isAnswer) variant = 'primary'
              else if (isPicked) variant = 'danger'
            }
            return (
              <Button
                key={opt}
                variant={variant}
                size="lg"
                disabled={locked}
                className="justify-start whitespace-normal text-left"
                onClick={() => handleAnswer(opt)}
              >
                {opt}
              </Button>
            )
          })}
        </div>

        {picked && picked !== meaningOf(current!) && (
          <p className="text-center text-sm font-bold text-duo-red">{t('study.wrong')}</p>
        )}
        {picked && picked === meaningOf(current!) && (
          <p className="text-center text-sm font-bold text-duo-dark">{t('study.correct')}</p>
        )}
        <div className="text-center">
          <Button variant="ghost" size="sm" onClick={() => navigate(`/words/${current?.id}`)}>
            {t('study.viewDetail')}
          </Button>
        </div>
      </div>
    )
  }

  // ---- 结算 ----
  if (phase === 'done') {
    const { quizTotal, quizCorrect } = statsRef.current
    const acc = quizTotal ? Math.round((quizCorrect / quizTotal) * 100) : 100
    return (
      <div className="flex flex-col items-center gap-4 py-20 text-center">
        <Celebration count={24} />
        <span className="text-6xl">🏆</span>
        <h1 className="text-2xl font-black text-ink">{t('study.doneTitle')}</h1>
        <p className="font-bold text-ink-soft">
          {t('study.doneNew')} <b className="text-duo-dark">{learnWords.length}</b> · {t('study.doneQuiz')}{' '}
          <b className="text-duo-dark">{quizTotal}</b> · {t('study.doneAcc')}{' '}
          <b className="text-duo-dark">{acc}%</b>
        </p>
        <Button onClick={() => setPhase('select')}>{t('study.again')}</Button>
        <Button variant="ghost" size="sm" onClick={() => navigate('/')}>
          {t('study.doneBack')}
        </Button>
      </div>
    )
  }

  // ---- 空态兜底 ----
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <span className="text-6xl">🌤️</span>
      <h1 className="text-2xl font-black text-ink">{t('study.emptyTitle')}</h1>
      <p className="font-bold text-ink-soft">{t('study.emptyMsg')}</p>
      <Button onClick={() => navigate('/add')}>{t('study.emptyAdd')}</Button>
    </div>
  )
}
