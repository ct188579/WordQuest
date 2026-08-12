import { useSettings } from '../stores/settings'
import en from './en'
import zh from './zh'
import ko from './ko'
import ja from './ja'

// ============================================================
// 轻量 i18n：zustand 持久化语言选择 + 扁平 key 字典
// ============================================================

export type UILanguage = 'en' | 'zh' | 'ko' | 'ja'

const dicts: Record<UILanguage, Record<string, string>> = { en, zh, ko, ja }

/** 可选语言（界面语言 & 单词本语言共用同一份） */
export const LANGUAGES: { code: UILanguage; native: string }[] = [
  { code: 'en', native: 'English' },
  { code: 'zh', native: '中文' },
  { code: 'ko', native: '한국어' },
  { code: 'ja', native: '日本語' },
]

/** 语言代码 → AI 提示词用的语言名 */
export const AI_LANG_NAMES: Record<string, string> = {
  en: 'English',
  zh: 'Chinese',
  ko: 'Korean',
  ja: 'Japanese',
}

/** 语言代码 → SpeechSynthesis 的 BCP-47 标签 */
export const SPEECH_LANGS: Record<string, string> = {
  en: 'en-US',
  zh: 'zh-CN',
  ko: 'ko-KR',
  ja: 'ja-JP',
}

/** React 组件内使用：const t = useT() */
export function useT() {
  const lang = useSettings((s) => s.language)
  return (key: string): string => dicts[lang]?.[key] ?? dicts.en[key] ?? key
}

/** 非 React 环境（service 层）使用 */
export function getT() {
  const lang = useSettings.getState().language
  return (key: string): string => dicts[lang]?.[key] ?? dicts.en[key] ?? key
}

/** 取当前界面语言代码 */
export function getUILanguage(): UILanguage {
  return useSettings.getState().language
}
