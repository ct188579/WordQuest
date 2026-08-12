import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UILanguage } from '../i18n'

/**
 * AI 配置 + 界面语言统一在 Settings 页管理，持久化到 localStorage。
 * 个人工具没必要为此单开一张数据库表。
 */
interface SettingsState {
  apiKey: string
  baseUrl: string
  model: string
  language: UILanguage
  setApiKey: (v: string) => void
  setBaseUrl: (v: string) => void
  setModel: (v: string) => void
  setLanguage: (v: UILanguage) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      language: 'en',
      setApiKey: (apiKey) => set({ apiKey }),
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setModel: (model) => set({ model }),
      setLanguage: (language) => set({ language }),
    }),
    { name: 'wl-settings' },
  ),
)
