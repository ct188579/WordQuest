import { create } from 'zustand'
import { persist } from 'zustand/middleware'

/** 精读文章中的核心词汇 */
export interface PressVocab {
  word: string
  /** 词性，如 n. / v. / adj. */
  pos: string
  /** 中文释义 */
  meaning: string
}

/** 外刊精读文章（AI 仿真仿写 或 真实外刊原文） */
export interface PressArticle {
  /** 内容来源：ai = AI 仿写；live = 从网上抓取的真实外刊 */
  origin?: 'ai' | 'live'
  /** 仿写的刊物名，或真实文章的来源刊物 */
  source: string
  title: string
  /** 英文段落 */
  paragraphs: string[]
  /** 每段对应的中文翻译（与 paragraphs 等长） */
  translations: string[]
  vocabulary: PressVocab[]
  /** 真实外刊原文链接（origin = live 时存在） */
  url?: string
  savedAt: number
}

interface PressState {
  article: PressArticle | null
  setArticle: (a: PressArticle) => void
  clearArticle: () => void
}

export const usePress = create<PressState>()(
  persist(
    (set) => ({
      article: null,
      setArticle: (article) => set({ article }),
      clearArticle: () => set({ article: null }),
    }),
    { name: 'wordquest-press' },
  ),
)
