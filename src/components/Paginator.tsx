import { ChevronLeft, ChevronRight } from 'lucide-react'
import { cn } from '../lib/utils'

/** 生成页码序列（含省略号）：1 … 4 5 6 … 10 */
function pageNumbers(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i)
  const set = new Set<number>(
    [0, 1, totalPages - 2, totalPages - 1, current - 1, current, current + 1].filter(
      (n) => n >= 0 && n < totalPages,
    ),
  )
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | '...')[] = []
  let prev = -2
  for (const n of sorted) {
    if (n - prev > 1) out.push('...')
    out.push(n)
    prev = n
  }
  return out
}

const btnCls = (active: boolean) =>
  cn(
    'flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-sm font-extrabold transition-colors',
    active ? 'bg-duo text-white' : 'text-ink-soft hover:bg-gray-100',
  )

/**
 * 传统分页器：‹ 页码(带省略号) ›
 * page/totalPages 均为 0 起；totalPages <= 1 时渲染 null
 */
export function Paginator({
  page,
  totalPages,
  onGoTo,
  disabled,
}: {
  page: number
  totalPages: number
  onGoTo: (p: number) => void
  disabled?: boolean
}) {
  if (totalPages <= 1) return null
  const goTo = (p: number) => {
    if (!disabled && p >= 0 && p < totalPages && p !== page) onGoTo(p)
  }
  return (
    <div className="flex items-center justify-center gap-1.5 py-2">
      <button
        onClick={() => goTo(page - 1)}
        disabled={page === 0 || disabled}
        className={cn(btnCls(false), 'disabled:cursor-not-allowed disabled:opacity-30')}
        aria-label="previous page"
      >
        <ChevronLeft size={18} />
      </button>
      {pageNumbers(page, totalPages).map((n, i) =>
        n === '...' ? (
          <span key={`e${i}`} className="px-1 text-sm font-bold text-gray-400">
            …
          </span>
        ) : (
          <button key={n} onClick={() => goTo(n)} className={btnCls(n === page)} disabled={disabled}>
            {n + 1}
          </button>
        ),
      )}
      <button
        onClick={() => goTo(page + 1)}
        disabled={page >= totalPages - 1 || disabled}
        className={cn(btnCls(false), 'disabled:cursor-not-allowed disabled:opacity-30')}
        aria-label="next page"
      >
        <ChevronRight size={18} />
      </button>
    </div>
  )
}
