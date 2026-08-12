import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { cachedFetch, invalidateCache } from './cache'
import type { Feedback, Word } from '../types'

// ============================================================
// 间隔重复算法（艾宾浩斯遗忘曲线 / Anki 简化版）
//
// 阶段阶梯（天）：
//   0    1    2    3    4    5     6     7
//   10m  1d   2d   4d   7d   15d   30d   60d
//
// 反馈规则：
//   know   → 阶段 +1，按 ease_factor 微调间隔
//   fuzzy  → 阶段不变，间隔减半（至少 1 天），ease 略降
//   forgot → 阶段归 0，10 分钟后重学，ease 降 0.2
// ============================================================

export const STAGE_INTERVALS = [10 / 1440, 1, 2, 4, 7, 15, 30, 60] as const
export const MAX_STAGE = STAGE_INTERVALS.length - 1

const MIN_EASE = 1.3

export interface ReviewResult {
  mastery_level: number
  ease_factor: number
  interval_days: number
  next_review_at: string
  review_count: number
  correct_count: number
}

/** 纯函数：根据当前单词状态 + 反馈，计算下一次调度（方便测试与复用） */
export function scheduleNext(word: Word, feedback: Feedback): ReviewResult {
  let stage = word.mastery_level
  let ease = word.ease_factor
  let interval: number

  if (feedback === 'know') {
    stage = Math.min(stage + 1, MAX_STAGE)
    ease = Math.min(ease + 0.05, 3.0)
    interval = STAGE_INTERVALS[stage] * (ease / 2.5) // 以 2.5 为基准微调
  } else if (feedback === 'fuzzy') {
    ease = Math.max(ease - 0.1, MIN_EASE)
    interval = Math.max(STAGE_INTERVALS[stage] / 2, 1) // 阶段不动，间隔减半
  } else {
    stage = 0
    ease = Math.max(ease - 0.2, MIN_EASE)
    interval = STAGE_INTERVALS[0] // 10 分钟后重学
  }

  return {
    mastery_level: stage,
    ease_factor: Math.round(ease * 100) / 100,
    interval_days: Math.round(interval * 100) / 100,
    next_review_at: dayjs().add(interval, 'day').toISOString(),
    review_count: word.review_count + 1,
    correct_count: word.correct_count + (feedback === 'know' ? 1 : 0),
  }
}

/** 提交一次复习结果：更新单词 + 写复习日志 */
export async function submitReview(word: Word, feedback: Feedback): Promise<void> {
  const next = scheduleNext(word, feedback)

  const { error } = await supabase.from('words').update(next).eq('id', word.id)
  if (error) throw error

  // 显式带上当前登录用户 id，避免 RLS 拒绝（数据库里也配了 auth.uid() 默认值兜底）
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error: logError } = await supabase.from('review_logs').insert({
    word_id: word.id,
    user_id: user?.id,
    feedback,
    stage_before: word.mastery_level,
    stage_after: next.mastery_level,
  })
  if (logError) throw logError

  // 数据已变：使看板 / 词库 / 待复习列表的缓存失效
  invalidateCache('dashboard')
  invalidateCache('words')
  invalidateCache('due')
}

/** 取当前到期需要复习的单词（按到期时间升序，带缓存，复习提交时自动失效） */
export async function fetchDueWords(): Promise<Word[]> {
  return cachedFetch('due', async () => {
    const { data, error } = await supabase
      .from('words')
      .select('*')
      .lte('next_review_at', dayjs().toISOString())
      .order('next_review_at', { ascending: true })
    if (error) throw error
    return (data ?? []) as Word[]
  })
}

/** 人类可读的下次复习时间描述 */
export function describeNextReview(iso: string): string {
  const diffMin = dayjs(iso).diff(dayjs(), 'minute')
  if (diffMin <= 0) return 'Due now'
  if (diffMin < 60) return `in ${diffMin} min`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `in ${diffHr} hr`
  return dayjs(iso).format('MMM D')
}
