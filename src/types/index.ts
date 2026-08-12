// ============================================================
// 全局类型定义
// ============================================================

export interface ExampleSentence {
  en: string
  cn: string
}

/** books 表行结构：单词本（不同语言） */
export interface Book {
  id: string
  user_id: string
  name: string
  language: string // 'en' | 'zh' | 'ko' | 'ja'
  created_at: string
}

/** words 表行结构 */
export interface Word {
  id: string
  user_id: string
  book_id: string | null // 所属单词本
  word: string
  phonetic: string | null       // 音标
  meaning_cn: string | null
  meaning_en: string | null
  part_of_speech: string | null
  example_sentences: ExampleSentence[]
  root_affix: string | null
  notes: string | null
  tags: string[]
  mastery_level: number
  ease_factor: number
  interval_days: number
  next_review_at: string
  review_count: number
  correct_count: number
  created_at: string
  updated_at: string
}

/** 新增 / 编辑单词时的可写字段 */
export type WordInsert = Partial<
  Omit<Word, 'id' | 'user_id' | 'created_at' | 'updated_at'>
> & { word: string }

/** AI 自动补全返回的结构 */
export interface AIWordCompletion {
  phonetic: string
  meaning_cn: string
  meaning_en: string
  part_of_speech: string
  examples: ExampleSentence[]
  root_affix: string
}

/** review_logs 表行结构 */
export interface ReviewLog {
  id: string
  user_id: string
  word_id: string
  feedback: Feedback
  stage_before: number
  stage_after: number
  reviewed_at: string
}

/** 复习反馈：认识 / 模糊 / 不认识 */
export type Feedback = 'know' | 'fuzzy' | 'forgot'

/** 看板统计 */
export interface DashboardStats {
  dueToday: number        // 今天待复习
  reviewedToday: number   // 今天已复习
  accuracyToday: number   // 今天正确率 0~1
  streakDays: number      // 连续打卡天数
  masteredCount: number   // 已掌握（mastery_level >= 5）
  totalCount: number      // 总单词数
}
