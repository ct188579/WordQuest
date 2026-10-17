import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Plus, BookOpen, BookOpenText, Settings as SettingsIcon, Flame, Star, Music2, GraduationCap } from 'lucide-react'
import gsap from 'gsap'
import { cn } from '../lib/utils'
import { useAuth } from '../stores/auth'
import { fetchDashboardStats } from '../services/words'
import { useT } from '../i18n'
import { AnimatedNumber } from './AnimatedNumber'

const NAV_ITEMS = [
  { to: '/', icon: Home, labelKey: 'nav.home', end: true },
  { to: '/words', icon: BookOpen, labelKey: 'nav.words' },
  { to: '/read', icon: BookOpenText, labelKey: 'nav.read' },
  { to: '/favorites', icon: Star, labelKey: 'nav.favorites' },
  { to: '/songs', icon: Music2, labelKey: 'nav.songs' },
  { to: '/study', icon: GraduationCap, labelKey: 'nav.study' },
  { to: '/settings', icon: SettingsIcon, labelKey: 'nav.settings' },
]

/** 整体布局：移动端底部导航 + 桌面端左侧侧边栏 + GSAP 页面切换过渡 */
export function Layout() {
  const location = useLocation()
  const navigate = useNavigate()
  const pageRef = useRef<HTMLDivElement>(null)
  const email = useAuth((s) => s.session?.user?.email)
  const t = useT()
  const [streak, setStreak] = useState(0)

  // 页面切换：滑入 + 淡入
  useEffect(() => {
    if (!pageRef.current) return
    gsap.fromTo(
      pageRef.current,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.35, ease: 'power2.out' },
    )
  }, [location.pathname])

  // 侧边栏展示连续打卡天数
  useEffect(() => {
    fetchDashboardStats()
      .then((s) => setStreak(s.streakDays))
      .catch(() => {})
  }, [])

  return (
    <div className="flex min-h-dvh">
      {/* ============ 桌面端侧边栏（md+） ============ */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r border-gray-200 bg-[#FBFAF6] px-4 py-6 md:flex">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="mb-8 flex cursor-pointer items-center gap-3 px-2 transition-opacity duration-200 hover:opacity-80"
        >
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-duo shadow-btn">
            <BookOpen size={20} className="text-white" strokeWidth={2.2} />
          </span>
          <span className="font-display text-xl font-semibold tracking-tight text-ink">WordQuest</span>
        </button>

        {/* 导航 */}
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map(({ to, icon: Icon, labelKey, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-lg px-4 py-2.5 text-sm font-medium transition-all duration-200 ease-out',
                  isActive
                    ? 'bg-duo/10 font-semibold text-duo-dark'
                    : 'text-ink-soft hover:bg-gray-100 hover:text-ink',
                )
              }
            >
              <Icon size={20} strokeWidth={2.2} />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* 添加单词 CTA */}
        <button
          onClick={() => navigate('/add')}
          className="mt-6 flex cursor-pointer items-center justify-center gap-2 rounded-xl bg-duo px-4 py-3 text-sm font-semibold text-white shadow-btn transition-all duration-200 ease-out hover:-translate-y-px hover:bg-duo-light hover:shadow-card active:translate-y-0"
        >
          <Plus size={18} strokeWidth={2.5} /> {t('nav.addWord')}
        </button>

        {/* 底部：打卡 + 账号 */}
        <div className="mt-auto flex flex-col gap-3">
          <div className="flex items-center justify-center gap-1.5 rounded-xl border border-duo-yellow/20 bg-duo-yellow/10 px-4 py-2.5">
            <Flame size={18} className="text-duo-yellow-dark" fill="currentColor" />
            <span className="text-sm font-semibold text-duo-yellow-dark">
              <AnimatedNumber value={streak} /> {t('layout.dayStreak')}
            </span>
          </div>
          {email && (
            <div className="flex items-center gap-3 rounded-xl bg-gray-100 px-3 py-2.5">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-duo text-sm font-semibold text-white">
                {email.charAt(0).toUpperCase()}
              </span>
              <span className="truncate text-xs font-medium text-ink-soft">{email}</span>
            </div>
          )}
        </div>
      </aside>

      {/* ============ 内容区 ============ */}
      <main ref={pageRef} className="flex-1 pb-28 pt-6 md:ml-64 md:pb-12">
        <div className="mx-auto w-full max-w-3xl px-4 md:px-8">
          <Outlet />
        </div>
      </main>

      {/* ============ 移动端底部导航（< md）：5 项 + 中间大号 ➕ 悬浮按钮 ============ */}
      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t border-gray-200 bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
        <div className="flex items-end justify-around px-2 py-2">
          {[
            ...NAV_ITEMS.slice(0, 2), // Home / Words
            { to: '/add', labelKey: 'nav.add', big: true },
            ...NAV_ITEMS.slice(5), // Study / Settings（Read / Favorites / Songs 通过首页卡片进入）
          ].map(({ to, icon: Icon, labelKey, big, end }: any) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 rounded-lg px-3 py-1 text-[10px] font-semibold transition-colors duration-200',
                  isActive ? 'text-duo-dark' : 'text-gray-400 hover:text-ink-soft',
                )
              }
              onClick={(e) => {
                // 中间大按钮：点击弹性动画
                if (big) {
                  e.preventDefault()
                  const el = e.currentTarget.querySelector('.add-btn')
                  if (el) {
                    gsap.fromTo(
                      el,
                      { scale: 0.88 },
                      { scale: 1, duration: 0.4, ease: 'elastic.out(1.2, 0.5)' },
                    )
                  }
                  navigate(to)
                }
              }}
            >
              {big ? (
                <span className="add-btn -mt-6 flex h-13 w-13 items-center justify-center rounded-xl bg-duo text-white shadow-lift">
                  <Plus size={26} strokeWidth={2.2} />
                </span>
              ) : (
                <Icon size={22} strokeWidth={2.2} />
              )}
              {big ? t('common.add') : t(labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
