import { useEffect, useRef } from 'react'
import gsap from 'gsap'

const EMOJIS = ['🎉', '⭐', '✨', '💚', '🌟', '💪']

/** 答对 / 完成任务时的庆祝粒子喷发（挂载即播放，播放完由父组件卸载） */
export function Celebration({ count = 14 }: { count?: number }) {
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = containerRef.current
    if (!container) return
    const particles: HTMLSpanElement[] = []

    for (let i = 0; i < count; i++) {
      const el = document.createElement('span')
      el.textContent = EMOJIS[Math.floor(Math.random() * EMOJIS.length)]
      el.style.position = 'absolute'
      el.style.left = '50%'
      el.style.top = '40%'
      el.style.fontSize = `${18 + Math.random() * 14}px`
      el.style.pointerEvents = 'none'
      container.appendChild(el)
      particles.push(el)

      const angle = Math.random() * Math.PI * 2
      const distance = 80 + Math.random() * 140
      gsap.fromTo(
        el,
        { x: 0, y: 0, scale: 0, opacity: 1, rotation: 0 },
        {
          x: Math.cos(angle) * distance,
          y: Math.sin(angle) * distance - 60,
          scale: 1,
          opacity: 0,
          rotation: (Math.random() - 0.5) * 360,
          duration: 1 + Math.random() * 0.6,
          ease: 'power2.out',
          onComplete: () => el.remove(),
        },
      )
    }

    return () => particles.forEach((p) => p.remove())
  }, [count])

  return <div ref={containerRef} className="pointer-events-none fixed inset-0 z-50" />
}
