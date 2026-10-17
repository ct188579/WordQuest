import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { cachedFetch, invalidateCache } from './cache'
import type { Word } from '../types'

// ============================================================
// 背单词：固定阶梯间隔算法（透明可解释，无 ease 微调）
//
// 规则极简：
//   答对   → 阶段 +1，间隔查阶梯表
//   答错   → 阶段归 0，10 分钟后可再来（本轮练习内也会重新排队）
//
// 阶梯（天）：
//   stage  0     1    2    3    4    5     6
//   间隔   10m   1d   2d   4d   7d   15d   30d
//
//   mastery_level >= 5 即「已掌握」（与看板 / 词库筛选口径一致）
// ============================================================

export const STAGE_INTERVALS = [10 / 1440, 1, 2, 4, 7, 15, 30] as const
export const MAX_STAGE = STAGE_INTERVALS.length - 1

export interface StudyResult {
  mastery_level: number
  interval_days: number
  next_review_at: string
  review_count: number
  correct_count: number
}

/** 纯函数：答对升一级、答错回零，间隔查表（方便测试与复用） */
export function scheduleNext(word: Word, correct: boolean): StudyResult {
  const stage = correct ? Math.min(word.mastery_level + 1, MAX_STAGE) : 0
  const interval = STAGE_INTERVALS[stage]

  return {
    mastery_level: stage,
    interval_days: Math.round(interval * 100) / 100,
    next_review_at: dayjs().add(interval, 'day').toISOString(),
    review_count: word.review_count + 1,
    correct_count: word.correct_count + (correct ? 1 : 0),
  }
}

/** 提交一次练习结果：更新单词 + 写练习日志（review_logs 沿用，打卡统计不断） */
export async function submitStudyResult(word: Word, correct: boolean): Promise<void> {
  const next = scheduleNext(word, correct)

  const { error } = await supabase.from('words').update(next).eq('id', word.id)
  if (error) throw error

  // 显式带上当前登录用户 id，避免 RLS 拒绝（数据库里也配了 auth.uid() 默认值兜底）
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { error: logError } = await supabase.from('review_logs').insert({
    word_id: word.id,
    user_id: user?.id,
    feedback: correct ? 'know' : 'forgot',
    stage_before: word.mastery_level,
    stage_after: next.mastery_level,
  })
  if (logError) throw logError

  // 数据已变：使看板 / 词库 / 学习队列相关缓存失效
  invalidateCache('dashboard')
  invalidateCache('words')
  invalidateCache('due')
  invalidateCache('new')
}

/** 到期待巩固的词（学过且到时间，按到期时间升序，最多取 50 个） */
export async function fetchDueWords(bookId?: string | null): Promise<Word[]> {
  return cachedFetch(`due:${bookId ?? 'all'}`, async () => {
    let q = supabase
      .from('words')
      .select('*')
      .gt('review_count', 0)
      .lte('next_review_at', dayjs().toISOString())
      .order('next_review_at', { ascending: true })
      .limit(50)
    if (bookId) q = q.eq('book_id', bookId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Word[]
  })
}

/** 未学过的新词（从未练过，按加入时间先后，先来先学） */
export async function fetchNewWords(bookId?: string | null): Promise<Word[]> {
  return cachedFetch(`new:${bookId ?? 'all'}`, async () => {
    let q = supabase
      .from('words')
      .select('*')
      .eq('review_count', 0)
      .order('created_at', { ascending: true })
      .limit(200)
    if (bookId) q = q.eq('book_id', bookId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Word[]
  })
}

/** 干扰项素材池：有释义的词，用于生成四选一选项（优先同本，最多 200 个） */
export async function fetchDistractorPool(bookId?: string | null): Promise<Word[]> {
  return cachedFetch(`pool:${bookId ?? 'all'}`, async () => {
    let q = supabase
      .from('words')
      .select('*')
      .or('meaning_cn.neq.null,meaning_en.neq.null')
      .limit(200)
    if (bookId) q = q.eq('book_id', bookId)
    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Word[]
  })
}

/** 单词的释义（选择题选项文案），中文优先，缺失时退回英文 / 原词 */
export function meaningOf(w: Word): string {
  return w.meaning_cn || w.meaning_en || w.word
}

/** 从素材池里为当前词挑 n 个干扰释义（排除自己与重复释义） */
export function pickDistractors(current: Word, pool: Word[], n = 3): string[] {
  const answer = meaningOf(current)
  const seen = new Set([answer])
  const picked: string[] = []
  for (const w of pool) {
    if (w.id === current.id) continue
    const m = meaningOf(w)
    if (seen.has(m)) continue
    seen.add(m)
    picked.push(m)
    if (picked.length >= n) break
  }
  return picked
}

/** 人类可读的下次复习时间描述（词库 / 详情页共用） */
export function describeNextReview(iso: string): string {
  const diffMin = dayjs(iso).diff(dayjs(), 'minute')
  if (diffMin <= 0) return 'Due now'
  if (diffMin < 60) return `in ${diffMin} min`
  const diffHr = Math.round(diffMin / 60)
  if (diffHr < 24) return `in ${diffHr} hr`
  return dayjs(iso).format('MMM D')
}
