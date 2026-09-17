import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GeneratedArticle } from '../services/ai'

// ============================================================
// 阅读页文章本地存储：跳到添加单词页等其它路由时文章不丢失
// ============================================================

/** 生成文章时参考的联网资料（展示来源用） */
export interface ArticleSource {
  title: string
  url: string
  host: string
}

interface ArticleState {
  topic: string
  title: string
  content: string
  lang: string
  savedAt: number | null
  /** 联网检索到的参考资料，未联网时为空数组 */
  sources: ArticleSource[]
  setArticle: (a: {
    topic: string
    title: string
    content: string
    lang: string
    sources?: ArticleSource[]
  }) => void
  clearArticle: () => void
}

export const useArticle = create<ArticleState>()(
  persist(
    (set) => ({
      topic: '',
      title: '',
      content: '',
      lang: 'en',
      savedAt: null,
      sources: [],
      setArticle: ({ topic, title, content, lang, sources = [] }) =>
        set({ topic, title, content, lang, sources, savedAt: Date.now() }),
      clearArticle: () =>
        set({ topic: '', title: '', content: '', lang: 'en', savedAt: null, sources: [] }),
    }),
    { name: 'wl-article' },
  ),
)

/** 仅取类型，避免页面里直接 import service 类型耦合 */
export type { GeneratedArticle }
