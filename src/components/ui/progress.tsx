import { useEffect, useRef } from 'react'
import gsap from 'gsap'
import { cn } from '../../lib/utils'

interface ProgressProps {
  /** 0 ~ 1 */
  value: number
  className?: string
  barClassName?: string
}

/** 进度条：value 变化时 GSAP 平滑增长 */
export function Progress({ value, className, barClassName }: ProgressProps) {
  const barRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!barRef.current) return
    gsap.to(barRef.current, {
      width: `${Math.min(Math.max(value, 0), 1) * 100}%`,
      duration: 0.8,
      ease: 'power3.out',
      overwrite: 'auto',
    })
  }, [value])

  return (
    <div className={cn('h-4 w-full overflow-hidden rounded-full bg-gray-200', className)}>
      <div
        ref={barRef}
        className={cn('h-full rounded-full bg-duo', barClassName)}
        style={{ width: 0 }}
      />
    </div>
  )
}
