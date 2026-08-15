import { useEffect, useState } from 'react'
import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom'
import { initAuthListener, useAuth } from './stores/auth'
import { isAllowedEmail } from './lib/authGate'
import { Layout } from './components/Layout'
import AccessDenied from './components/AccessDenied'
import Login from './pages/Login'
import Dashboard from './pages/Dashboard'
import Words from './pages/Words'
import WordDetail from './pages/WordDetail'
import AddWord from './pages/AddWord'
import Read from './pages/Read'
import Review from './pages/Review'
import Favorites from './pages/Favorites'
import Settings from './pages/Settings'

export default function App() {
  const session = useAuth((s) => s.session)
  const loading = useAuth((s) => s.loading)
  const [deniedEmail, setDeniedEmail] = useState<string | null>(null)

  useEffect(() => {
    initAuthListener()
  }, [])

  // 白名单门禁：登录后如果不是允许的邮箱 → 立即登出并显示拒绝页
  useEffect(() => {
    if (!session) return
    if (!isAllowedEmail(session.user.email)) {
      setDeniedEmail(session.user.email ?? 'unknown')
      useAuth.getState().signOut()
    } else {
      setDeniedEmail(null)
    }
  }, [session])

  if (loading) {
    return (
      <div className="flex min-h-dvh items-center justify-center bg-white">
        <span className="text-4xl">🦉</span>
      </div>
    )
  }

  if (deniedEmail) return <AccessDenied email={deniedEmail} />

  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={session ? <Navigate to="/" replace /> : <Login />} />
        {session ? (
          <Route element={<Layout />}>
            <Route index element={<Dashboard />} />
            <Route path="/words" element={<Words />} />
            <Route path="/words/:id" element={<WordDetail />} />
            <Route path="/add" element={<AddWord />} />
            <Route path="/read" element={<Read />} />
            <Route path="/favorites" element={<Favorites />} />
            <Route path="/review" element={<Review />} />
            <Route path="/settings" element={<Settings />} />
          </Route>
        ) : (
          <Route path="*" element={<Navigate to="/login" replace />} />
        )}
      </Routes>
    </BrowserRouter>
  )
}
