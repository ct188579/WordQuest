import { create } from 'zustand'
import type { Session } from '@supabase/supabase-js'
import { supabase } from '../lib/supabase'
import { clearCache } from '../services/cache'

interface AuthState {
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<string | null>
  signIn: (email: string, password: string) => Promise<string | null>
  signOut: () => Promise<void>
}

export const useAuth = create<AuthState>(() => ({
  session: null,
  loading: true,

  /** Google OAuth 登录（首次登录会自动创建账号） */
  signInWithGoogle: async () => {
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        // 登录完成后跳回当前页面（本地开发即 http://localhost:5173）
        redirectTo: window.location.origin,
      },
    })
    return error?.message ?? null
  },

  signIn: async (email, password) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return error?.message ?? null
  },

  signOut: async () => {
    await supabase.auth.signOut()
    clearCache() // 登出时清空数据缓存，避免切换账号串数据
  },
}))

/** 在 App 根组件调用一次：恢复会话并监听变化 */
export function initAuthListener() {
  supabase.auth.getSession().then(({ data }) => {
    useAuth.setState({ session: data.session, loading: false })
  })
  supabase.auth.onAuthStateChange((_event, session) => {
    useAuth.setState({ session })
  })
}
