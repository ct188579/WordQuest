import { useEffect, useRef, useState } from 'react'
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom'
import { Home, Layers, Plus, BookOpen, BookOpenText, Settings as SettingsIcon, Flame } from 'lucide-react'
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
  { to: '/review', icon: Layers, labelKey: 'nav.review' },
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
    <div className="flex min-h-dvh bg-white">
      {/* ============ 桌面端侧边栏（md+） ============ */}
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-64 flex-col border-r-2 border-gray-200 bg-white px-4 py-6 md:flex">
        {/* Logo */}
        <button
          onClick={() => navigate('/')}
          className="mb-8 flex cursor-pointer items-center gap-3 px-2"
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-duo shadow-[0_4px_0_#46A302]">
            <BookOpen size={24} className="text-white" strokeWidth={2.5} />
          </span>
          <span className="text-xl font-black text-duo">WordQuest</span>
        </button>

        {/* 导航 */}
        <nav className="flex flex-col gap-1.5">
          {NAV_ITEMS.map(({ to, icon: Icon, labelKey, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex items-center gap-3 rounded-2xl px-4 py-3 text-sm font-extrabold transition-colors',
                  isActive
                    ? 'bg-duo/10 text-duo'
                    : 'text-gray-400 hover:bg-gray-50 hover:text-ink-soft',
                )
              }
            >
              <Icon size={22} strokeWidth={2.5} />
              {t(labelKey)}
            </NavLink>
          ))}
        </nav>

        {/* 添加单词 CTA */}
        <button
          onClick={() => navigate('/add')}
          className="mt-6 flex cursor-pointer items-center justify-center gap-2 rounded-2xl bg-duo px-4 py-3.5 text-base font-extrabold text-white shadow-[0_4px_0_#46A302] transition-transform hover:-translate-y-0.5"
        >
          <Plus size={20} strokeWidth={3} /> {t('nav.addWord')}
        </button>

        {/* 底部：打卡 + 账号 */}
        <div className="mt-auto flex flex-col gap-4">
          <div className="flex items-center justify-center gap-1.5 rounded-2xl bg-orange-50 px-4 py-3">
            <Flame size={20} className="text-orange-500" fill="currentColor" />
            <span className="text-sm font-black text-orange-500">
              <AnimatedNumber value={streak} /> {t('layout.dayStreak')}
            </span>
          </div>
          {email && (
            <div className="flex items-center gap-3 rounded-2xl bg-gray-50 px-3 py-2.5">
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-duo text-base font-black text-white">
                {email.charAt(0).toUpperCase()}
              </span>
              <span className="truncate text-xs font-bold text-ink-soft">{email}</span>
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
      <nav className="fixed bottom-0 left-1/2 z-40 w-full max-w-lg -translate-x-1/2 border-t-2 border-gray-200 bg-white pb-[env(safe-area-inset-bottom)] md:hidden">
        <div className="flex items-end justify-around px-2 py-2">
          {[
            ...NAV_ITEMS.slice(0, 2), // Home / Words
            { to: '/add', labelKey: 'nav.add', big: true },
            ...NAV_ITEMS.slice(3), // Review / Settings（Read 通过首页横幅进入）
          ].map(({ to, icon: Icon, labelKey, big, end }: any) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                cn(
                  'flex flex-col items-center gap-0.5 rounded-2xl px-3 py-1 text-[10px] font-extrabold uppercase transition-colors',
                  isActive ? 'text-duo' : 'text-gray-400 hover:text-ink-soft',
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
                      { scale: 0.85, rotation: -8 },
                      { scale: 1, rotation: 0, duration: 0.5, ease: 'elastic.out(1.4, 0.4)' },
                    )
                  }
                  navigate(to)
                }
              }}
            >
              {big ? (
                <span className="add-btn -mt-6 flex h-14 w-14 items-center justify-center rounded-2xl bg-duo text-white shadow-[0_4px_0_#46A302]">
                  <Plus size={28} strokeWidth={2.5} />
                </span>
              ) : (
                <Icon size={24} strokeWidth={2.5} />
              )}
              {big ? t('common.add') : t(labelKey)}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
