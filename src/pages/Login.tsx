import { useState } from 'react'
import { BookOpen } from 'lucide-react'
import { useAuth } from '../stores/auth'
import { isSupabaseConfigured } from '../lib/supabase'
import { useT } from '../i18n'

/** Google 官方彩色 G 图标 */
function GoogleIcon() {
  return (
    <svg viewBox="0 0 48 48" className="h-5 w-5" aria-hidden>
      <path
        fill="#EA4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285F4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#FBBC05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34A853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  )
}

export default function Login() {
  const { signInWithGoogle } = useAuth()
  const t = useT()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  /** Google OAuth：浏览器跳转到 Google 授权页，登录后回到本应用，App 层做白名单校验 */
  const handleGoogle = async () => {
    setBusy(true)
    setError(null)
    const err = await signInWithGoogle()
    setBusy(false)
    if (err) setError(err)
  }

  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-6 bg-white px-6">
      <div className="flex flex-col items-center gap-3">
        <div className="flex h-20 w-20 items-center justify-center rounded-3xl bg-duo shadow-[0_6px_0_#46A302]">
          <BookOpen size={40} className="text-white" strokeWidth={2.5} />
        </div>
        <h1 className="text-3xl font-black text-duo">WordQuest</h1>
        <p className="font-bold text-ink-soft">{t('login.tagline')}</p>
      </div>

      {!isSupabaseConfigured && (
        <p className="w-full rounded-2xl bg-duo-red/10 p-3 text-sm font-bold text-duo-red">
          {t('login.notConfigured')}
        </p>
      )}

      {/* Google 一键登录 */}
      <button
        onClick={handleGoogle}
        disabled={busy || !isSupabaseConfigured}
        className="flex w-full cursor-pointer items-center justify-center gap-3 rounded-2xl border-2 border-gray-200 bg-white px-6 py-4 text-base font-extrabold text-ink transition-colors hover:bg-gray-50 disabled:cursor-not-allowed disabled:opacity-60"
      >
        <GoogleIcon />
        {busy ? t('login.googleBusy') : t('login.google')}
      </button>
      <p className="-mt-3 text-xs font-bold text-gray-400">{t('login.onlyOwner')}</p>

      {error && (
        <p className="w-full rounded-2xl bg-duo-red/10 p-3 text-sm font-bold text-duo-red">
          {error}
        </p>
      )}
    </div>
  )
}
