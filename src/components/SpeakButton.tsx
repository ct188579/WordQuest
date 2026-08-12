import { useRef, useState } from 'react'
import { Volume2 } from 'lucide-react'
import gsap from 'gsap'
import { cn } from '../lib/utils'
import { SPEECH_LANGS } from '../i18n'

/**
 * 喇叭朗读按钮：调用浏览器内置 SpeechSynthesis API
 * lang 传入单词本语言代码（en/zh/ko/ja），自动映射到对应语音
 */
export function SpeakButton({
  text,
  lang = 'en',
  size = 20,
  className,
}: {
  text: string
  lang?: string
  size?: number
  className?: string
}) {
  const [speaking, setSpeaking] = useState(false)
  const btnRef = useRef<HTMLButtonElement>(null)

  const speak = (e: React.MouseEvent<HTMLButtonElement>) => {
    // 阻止冒泡：复习卡片整体点击会翻转，点喇叭不应触发
    e.stopPropagation()
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) return

    const speechLang = SPEECH_LANGS[lang] ?? 'en-US'
    window.speechSynthesis.cancel() // 打断上一次朗读
    const utterance = new SpeechSynthesisUtterance(text)
    utterance.lang = speechLang
    utterance.rate = 0.85 // 稍慢，便于听清

    // 优先选该语言的本地声音
    const voices = window.speechSynthesis.getVoices()
    const voice =
      voices.find((v) => v.lang === speechLang) ?? voices.find((v) => v.lang.startsWith(lang))
    if (voice) utterance.voice = voice

    utterance.onstart = () => setSpeaking(true)
    utterance.onend = () => setSpeaking(false)
    utterance.onerror = () => setSpeaking(false)
    window.speechSynthesis.speak(utterance)

    // 点击弹性反馈
    if (btnRef.current) {
      gsap.fromTo(
        btnRef.current,
        { scale: 0.8, rotation: -12 },
        { scale: 1, rotation: 0, duration: 0.45, ease: 'elastic.out(1.5, 0.4)' },
      )
    }
  }

  return (
    <button
      ref={btnRef}
      type="button"
      onClick={speak}
      title="Listen"
      aria-label={`Listen to ${text}`}
      className={cn(
        'inline-flex cursor-pointer items-center rounded-full p-1 transition-colors',
        speaking ? 'text-duo-blue-dark' : 'text-duo-blue hover:text-duo-blue-dark',
        className,
      )}
    >
      <Volume2 size={size} strokeWidth={2.5} className={speaking ? 'animate-pulse' : ''} />
    </button>
  )
}
