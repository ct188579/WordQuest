import { ShieldX } from 'lucide-react'
import { useT } from '../i18n'

/** 非白名单账号登录后的拒绝页 */
export default function AccessDenied({ email }: { email: string }) {
  const t = useT()
  return (
    <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-4 px-6 text-center">
      <ShieldX size={64} className="text-duo-red" strokeWidth={2} />
      <h1 className="text-2xl font-black text-ink">{t('denied.title')}</h1>
      <p className="font-bold leading-relaxed text-ink-soft">
        {t('denied.msg')} <span className="text-duo-red">{email}</span>
      </p>
      <p className="text-sm font-semibold text-gray-400">{t('denied.note')}</p>
    </div>
  )
}
