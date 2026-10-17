import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { UILanguage } from '../i18n'

/** 联网搜索的时效范围 */
export type Freshness = 'week' | 'month' | 'year' | 'any'

/**
 * AI 配置 + 阅读偏好 + 界面语言统一在 Settings 页管理，持久化到 localStorage。
 * 个人工具没必要为此单开一张数据库表。
 *
 * 注意：密钥只存本地 localStorage，绝不写进代码或 .env，
 * 避免开源仓库 / 前端产物里泄露。
 */
interface SettingsState {
  apiKey: string
  baseUrl: string
  model: string
  language: UILanguage
  /** 兴趣方向（自由文本，逗号分隔），用于 AI 推荐话题 */
  interests: string
  /** Tavily 搜索 API Key，用于「阅读时联网搜最新资料」 */
  tavilyKey: string
  /** 生成文章前是否联网检索最新资料 */
  useSearch: boolean
  /** 检索时效 */
  freshness: Freshness
  /** 背单词：每轮新学几个词 */
  dailyNewWords: number
  setApiKey: (v: string) => void
  setBaseUrl: (v: string) => void
  setModel: (v: string) => void
  setLanguage: (v: UILanguage) => void
  setInterests: (v: string) => void
  setTavilyKey: (v: string) => void
  setUseSearch: (v: boolean) => void
  setFreshness: (v: Freshness) => void
  setDailyNewWords: (v: number) => void
}

export const useSettings = create<SettingsState>()(
  persist(
    (set) => ({
      apiKey: '',
      baseUrl: 'https://api.openai.com/v1',
      model: 'gpt-4o-mini',
      language: 'en',
      interests: '',
      tavilyKey: '',
      useSearch: true,
      freshness: 'month',
      dailyNewWords: 10,
      setApiKey: (apiKey) => set({ apiKey }),
      setBaseUrl: (baseUrl) => set({ baseUrl }),
      setModel: (model) => set({ model }),
      setLanguage: (language) => set({ language }),
      setInterests: (interests) => set({ interests }),
      setTavilyKey: (tavilyKey) => set({ tavilyKey }),
      setUseSearch: (useSearch) => set({ useSearch }),
      setFreshness: (freshness) => set({ freshness }),
      setDailyNewWords: (dailyNewWords) => set({ dailyNewWords }),
    }),
    { name: 'wl-settings' },
  ),
)
