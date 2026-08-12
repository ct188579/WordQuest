/** AI 请求时的弹跳点 Loading */
export function AILoading({ label = 'AI is thinking' }: { label?: string }) {
  return (
    <span className="inline-flex items-center gap-2 text-duo-blue-dark font-bold">
      <span className="inline-flex gap-1">
        <span className="dot-bounce inline-block h-2 w-2 rounded-full bg-duo-blue" />
        <span className="dot-bounce inline-block h-2 w-2 rounded-full bg-duo-blue" />
        <span className="dot-bounce inline-block h-2 w-2 rounded-full bg-duo-blue" />
      </span>
      {label}…
    </span>
  )
}
