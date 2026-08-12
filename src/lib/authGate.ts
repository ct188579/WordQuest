// ============================================================
// 登录白名单：只有 VITE_ALLOWED_EMAILS 里的邮箱能使用本应用
// 前端这一层负责「体验」——后端 RLS 还有一层硬限制，改代码也绕不过
// ============================================================

export const ALLOWED_EMAILS: string[] = (
  (import.meta.env.VITE_ALLOWED_EMAILS as string | undefined) ?? ''
)
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean)

/** 未配置白名单时默认全部拒绝（安全优先，避免误放行） */
export function isAllowedEmail(email?: string | null): boolean {
  if (!email) return false
  if (ALLOWED_EMAILS.length === 0) return false
  return ALLOWED_EMAILS.includes(email.toLowerCase())
}
