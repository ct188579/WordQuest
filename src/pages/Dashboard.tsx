import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Target, CheckCircle2, Layers, BookOpenText, Star, Music2, ChevronRight } from 'lucide-react'
import gsap from 'gsap'
import dayjs from 'dayjs'
import { fetchDashboardStats, fetchWords } from '../services/words'
import { useT } from '../i18n'
import type { DashboardStats, Word } from '../types'
import { Card } from '../components/ui/card'
import { Progress } from '../components/ui/progress'
import { Button } from '../components/ui/button'
import { AnimatedNumber } from '../components/AnimatedNumber'

const EMPTY: DashboardStats = {
  dueToday: 0,
  reviewedToday: 0,
  accuracyToday: 0,
  streakDays: 0,
  masteredCount: 0,
  totalCount: 0,
}

export default function Dashboard() {
  const t = useT()
  const [stats, setStats] = useState<DashboardStats>(EMPTY)
  const [words, setWords] = useState<Word[]>([])
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    Promise.all([fetchDashboardStats(), fetchWords()])
      .then(([s, ws]) => {
        setStats(s)
        setWords(ws)
      })
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // 卡片交错入场
  useEffect(() => {
    if (loading || !listRef.current) return
    gsap.fromTo(
      listRef.current.children,
      { opacity: 0, y: 24, scale: 0.95 },
      { opacity: 1, y: 0, scale: 1, duration: 0.5, stagger: 0.08, ease: 'back.out(1.6)' },
    )
  }, [loading])

  const done = stats.dueToday === 0
  const total = stats.dueToday + stats.reviewedToday
  const progress = total > 0 ? stats.reviewedToday / total : done ? 1 : 0

  // 掌握度分布（0 未学 / 1-4 学习中 / 5+ 已掌握）
  const newCount = words.filter((w) => w.mastery_level === 0).length
  const learningCount = words.filter((w) => w.mastery_level >= 1 && w.mastery_level < 5).length
  const masteredCount = words.length - newCount - learningCount
  const stageCounts = Array.from({ length: 7 }, (_, lv) =>
    words.filter((w) => w.mastery_level === lv).length,
  )
  const stageMax = Math.max(...stageCounts, 1)

  return (
    <div className="flex flex-col gap-5">
      <header>
        <p className="text-sm font-extrabold uppercase tracking-wide text-ink-soft">
          {dayjs().format('dddd, MMM D')}
        </p>
        <h1 className="text-2xl font-black text-ink">
          {done ? t('dash.done') : t('dash.ready')}
        </h1>
      </header>

      {/* 今日任务看板 */}
      <Card className="border-duo/40 bg-duo/5">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Layers className="text-duo" size={22} />
            <span className="font-extrabold text-ink">{t('dash.mission')}</span>
          </div>
          <span className="font-black text-duo-dark">
            <AnimatedNumber value={stats.reviewedToday} /> / {total}
          </span>
        </div>
        <Progress value={progress} />
        <p className="mt-2 text-sm font-bold text-ink-soft">
          {done ? t('dash.noneDue') : `${stats.dueToday} ${t('dash.wordsWaiting')}`}
        </p>
        {!done && (
          <Link to="/study" className="mt-4 block">
            <Button className="w-full" size="lg">
              {t('dash.startStudy')}
            </Button>
          </Link>
        )}
      </Card>

      {/* 单词掌握度可视化 */}
      <Card className="flex flex-col gap-5 p-5">
        <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">
          {t('dash.mastery')}
        </span>
        <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-start sm:gap-8">
          <MasteryDonut
            mastered={masteredCount}
            learning={learningCount}
            fresh={newCount}
            label={t('dash.mastered')}
            labelLearning={t('dash.learning')}
            labelNew={t('dash.newWords')}
            totalLabel={t('dash.total')}
          />
          {/* 各阶段分布条形图 */}
          <div className="w-full flex-1">
            <p className="mb-2.5 text-xs font-extrabold uppercase tracking-wide text-ink-soft">
              {t('dash.levelDist')}
            </p>
            <div className="flex flex-col gap-2">
              {[6, 5, 4, 3, 2, 1, 0].map((lv) => (
                <StageBar
                  key={lv}
                  lv={lv}
                  count={stageCounts[lv]}
                  max={stageMax}
                  tone={lv >= 5 ? 'bg-duo' : lv >= 1 ? 'bg-duo-blue' : 'bg-gray-300'}
                />
              ))}
            </div>
          </div>
        </div>
      </Card>

      {/* 阅读入口：渐变大横幅 */}
      <Link to="/read">
        <div className="relative flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-r from-duo to-duo-blue p-5 shadow-card transition-all duration-300 ease-out hover:-translate-y-0.5 hover:shadow-lift">
          {/* 装饰圆点 */}
          <span className="pointer-events-none absolute -right-6 -top-8 h-28 w-28 rounded-full bg-white/10" />
          <span className="pointer-events-none absolute -bottom-10 right-10 h-20 w-20 rounded-full bg-white/10" />
          <div className="relative flex items-center gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white/20 backdrop-blur">
              <BookOpenText size={26} className="text-white" />
            </span>
            <div>
              <p className="text-lg font-black text-white">{t('nav.read')}</p>
              <p className="text-xs font-bold text-white/80">{t('dash.readArticle')}</p>
            </div>
          </div>
          <span className="relative flex shrink-0 items-center gap-1 rounded-full bg-white px-3.5 py-1.5 text-xs font-black text-duo">
            {t('dash.readCta')} <ChevronRight size={14} />
          </span>
        </div>
      </Link>

      {/* 收藏本入口 */}
      <Link to="/favorites">
        <Card className="flex items-center justify-between transition-colors hover:border-duo-yellow">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-duo-yellow/15">
              <Star size={22} className="text-duo-yellow-dark" fill="currentColor" />
            </span>
            <div>
              <p className="font-extrabold text-ink">{t('nav.favorites')}</p>
              <p className="text-xs font-bold text-ink-soft">{t('dash.favorites')}</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-300" />
        </Card>
      </Link>

      {/* 英文歌入口 */}
      <Link to="/songs">
        <Card className="flex items-center justify-between transition-colors hover:border-duo-blue">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-duo-blue/10">
              <Music2 size={22} className="text-duo-blue" />
            </span>
            <div>
              <p className="font-extrabold text-ink">{t('nav.songs')}</p>
              <p className="text-xs font-bold text-ink-soft">{t('dash.songs')}</p>
            </div>
          </div>
          <ChevronRight size={18} className="text-gray-300" />
        </Card>
      </Link>

      {/* 打卡 + 正确率（掌握度与总数已并入上图，不再重复展示） */}
      <div ref={listRef} className="grid grid-cols-2 gap-3">
        <StatCard
          icon={<Flame size={22} className="text-orange-500" />}
          label={t('dash.streak')}
          value={stats.streakDays}
          loading={loading}
        />
        <StatCard
          icon={<Target size={22} className="text-duo-blue" />}
          label={t('dash.accuracy')}
          value={Math.round(stats.accuracyToday * 100)}
          suffix="%"
          loading={loading}
        />
      </div>
    </div>
  )
}

/** 掌握度环形图（纯 SVG，三段圆弧：未学 / 学习中 / 已掌握），中心显示掌握百分比 */
function MasteryDonut({
  mastered,
  learning,
  fresh,
  label,
  labelLearning,
  labelNew,
  totalLabel,
}: {
  mastered: number
  learning: number
  fresh: number
  label: string
  labelLearning: string
  labelNew: string
  totalLabel: string
}) {
  const total = mastered + learning + fresh
  const R = 54
  const C = 2 * Math.PI * R
  const segs = [
    { v: mastered, color: '#58cc02', label },
    { v: learning, color: '#1cb0f6', label: labelLearning },
    { v: fresh, color: '#e5e7eb', label: labelNew },
  ]
  const pct = total ? Math.round((mastered / total) * 100) : 0

  // 从顶部（-90°）顺时针依次画弧，段与段之间留 2px 缝隙
  let offset = 0
  const arcs = segs
    .filter((s) => s.v > 0)
    .map((s) => {
      const frac = s.v / total
      const gap = frac < 1 ? 2 : 0
      const dash = Math.max(frac * C - gap, 0.5)
      const el = (
        <circle
          key={s.color}
          cx="70"
          cy="70"
          r={R}
          fill="none"
          stroke={s.color}
          strokeWidth="16"
          strokeLinecap="round"
          strokeDasharray={`${dash} ${C - dash}`}
          strokeDashoffset={-offset}
          transform="rotate(-90 70 70)"
        />
      )
      offset += frac * C
      return el
    })

  return (
    <div className="flex shrink-0 items-center gap-4">
      <div className="relative h-36 w-36">
        <svg viewBox="0 0 140 140" className="h-full w-full">
          <circle cx="70" cy="70" r={R} fill="none" stroke="#f0f0ec" strokeWidth="16" />
          {arcs}
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-2xl font-black text-ink">{pct}%</span>
          <span className="text-[10px] font-extrabold uppercase text-ink-soft">{label}</span>
        </div>
      </div>
      <div className="flex flex-col gap-2">
        {segs.map((s) => (
          <div key={s.color} className="flex items-center gap-2">
            <span className="h-3 w-3 rounded-full" style={{ background: s.color }} />
            <span className="text-xs font-bold text-ink-soft">{s.label}</span>
            <span className="text-sm font-black text-ink">{s.v}</span>
          </div>
        ))}
        <div className="mt-1 flex items-center gap-2 border-t border-gray-100 pt-2">
          <CheckCircle2 size={14} className="text-duo" />
          <span className="text-xs font-bold text-ink-soft">{totalLabel}</span>
          <span className="text-sm font-black text-ink">{total}</span>
        </div>
      </div>
    </div>
  )
}

/** 单阶段横条 */
function StageBar({ lv, count, max, tone }: { lv: number; count: number; max: number; tone: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-9 shrink-0 text-right text-[11px] font-extrabold text-ink-soft">Lv.{lv}</span>
      <div className="h-4 flex-1 overflow-hidden rounded-full bg-paper">
        <div
          className={`h-full rounded-full ${tone} transition-all duration-700`}
          style={{ width: `${(count / max) * 100}%` }}
        />
      </div>
      <span className="w-7 shrink-0 text-xs font-black text-ink">{count}</span>
    </div>
  )
}

function StatCard({
  icon,
  label,
  value,
  suffix,
  loading,
}: {
  icon: React.ReactNode
  label: string
  value: number
  suffix?: string
  loading: boolean
}) {
  return (
    <Card className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        {icon}
        <span className="text-xs font-extrabold uppercase tracking-wide text-ink-soft">{label}</span>
      </div>
      <span className="text-3xl font-black text-ink">
        {loading ? '—' : <AnimatedNumber value={value} />}
        {suffix}
      </span>
    </Card>
  )
}
