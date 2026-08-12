import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import type { GeneratedArticle } from '../services/ai'

// ============================================================
// 阅读页文章本地存储：跳到添加单词页等其它路由时文章不丢失
// ============================================================

interface ArticleState {
  topic: string
  title: string
  content: string
  lang: string
  savedAt: number | null
  setArticle: (a: { topic: string; title: string; content: string; lang: string }) => void
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
      setArticle: ({ topic, title, content, lang }) =>
        set({ topic, title, content, lang, savedAt: Date.now() }),
      clearArticle: () => set({ topic: '', title: '', content: '', lang: 'en', savedAt: null }),
    }),
    { name: 'wl-article' },
  ),
)

/** 仅取类型，避免页面里直接 import service 类型耦合 */
export type { GeneratedArticle }
