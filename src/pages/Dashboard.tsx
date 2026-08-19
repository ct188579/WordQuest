import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Flame, Target, CheckCircle2, Trophy, Layers, BookOpenText, Star, Music2, ChevronRight } from 'lucide-react'
import gsap from 'gsap'
import dayjs from 'dayjs'
import { fetchDashboardStats } from '../services/words'
import { useT } from '../i18n'
import type { DashboardStats } from '../types'
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
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    fetchDashboardStats()
      .then(setStats)
      .catch(console.error)
      .finally(() => setLoading(false))
  }, [])

  // 统计卡片交错入场
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
          <Link to="/review" className="mt-4 block">
            <Button className="w-full" size="lg">
              {t('dash.startReview')}
            </Button>
          </Link>
        )}
      </Card>

      {/* 阅读入口：渐变大横幅 */}
      <Link to="/read">
        <div className="relative flex items-center justify-between overflow-hidden rounded-2xl bg-gradient-to-r from-duo to-duo-blue p-5 shadow-[0_4px_0_rgb(0_0_0/0.15)] transition-transform hover:-translate-y-0.5 active:translate-y-0.5">
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

      {/* 统计网格 */}
      <div ref={listRef} className="grid grid-cols-2 gap-3 md:grid-cols-4">
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
        <StatCard
          icon={<Trophy size={22} className="text-duo-yellow-dark" />}
          label={t('dash.mastered')}
          value={stats.masteredCount}
          loading={loading}
        />
        <StatCard
          icon={<CheckCircle2 size={22} className="text-duo" />}
          label={t('dash.total')}
          value={stats.totalCount}
          loading={loading}
        />
      </div>
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
