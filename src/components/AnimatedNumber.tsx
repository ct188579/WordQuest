import { useEffect, useRef } from 'react'
import gsap from 'gsap'

/** 数字变化时滚动动画（用于统计卡片） */
export function AnimatedNumber({ value, className }: { value: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  const prev = useRef(0)

  useEffect(() => {
    if (!ref.current) return
    const obj = { v: prev.current }
    gsap.to(obj, {
      v: value,
      duration: 0.8,
      ease: 'power2.out',
      overwrite: 'auto',
      onUpdate: () => {
        if (ref.current) ref.current.textContent = String(Math.round(obj.v))
      },
    })
    prev.current = value
  }, [value])

  return (
    <span ref={ref} className={className}>
      0
    </span>
  )
}
