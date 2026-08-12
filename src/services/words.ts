import dayjs from 'dayjs'
import { supabase } from '../lib/supabase'
import { cachedFetch, invalidateCache } from './cache'
import type { DashboardStats, ReviewLog, Word, WordInsert } from '../types'

// ============================================================
// 词库 CRUD + 筛选 + 统计
// ============================================================

export interface WordFilter {
  search?: string
  tag?: string | null
  bookId?: string | null // 按单词本筛选
  mastery?: 'all' | 'new' | 'learning' | 'mastered'
  sort?: 'newest' | 'oldest' | 'review'
}

export const WORDS_PAGE_SIZE = 20

export interface WordPage {
  words: Word[]
  total: number
}

/**
 * 分页查询词库（服务端 range 分页 + 总数）。
 * 缓存 key 包含筛选条件和页码；写操作会 invalidateCache('words') 一并失效。
 */
export async function fetchWordsPage(
  filter: WordFilter = {},
  page = 0,
  pageSize: number = WORDS_PAGE_SIZE,
): Promise<WordPage> {
  // 缓存 key 含筛选条件、页码、页大小（页大小随屏幕变化）
  return cachedFetch(`words:${JSON.stringify(filter)}:p${page}:s${pageSize}`, async () => {
    let q = supabase.from('words').select('*', { count: 'exact' })

    if (filter.search) q = q.ilike('word', `%${filter.search.trim()}%`)
    if (filter.tag) q = q.contains('tags', [filter.tag])
    if (filter.bookId) q = q.eq('book_id', filter.bookId)
    if (filter.mastery === 'new') q = q.eq('mastery_level', 0)
    if (filter.mastery === 'learning') q = q.gte('mastery_level', 1).lte('mastery_level', 4)
    if (filter.mastery === 'mastered') q = q.gte('mastery_level', 5)

    if (filter.sort === 'oldest') q = q.order('created_at', { ascending: true })
    else if (filter.sort === 'review') q = q.order('next_review_at', { ascending: true })
    else q = q.order('created_at', { ascending: false })

    const from = page * pageSize
    q = q.range(from, from + pageSize - 1)

    const { data, error, count } = await q
    if (error) throw error
    return { words: (data ?? []) as Word[], total: count ?? 0 }
  })
}

/** 全量查询（不分页，用于生成短文等需要大量单词的场景） */
export async function fetchWords(filter: WordFilter = {}): Promise<Word[]> {
  // 按筛选条件缓存：页面跳转回来（条件重置为默认）直接命中，不重复请求
  return cachedFetch(`words:${JSON.stringify(filter)}`, async () => {
    let q = supabase.from('words').select('*')

    if (filter.search) q = q.ilike('word', `%${filter.search.trim()}%`)
    if (filter.tag) q = q.contains('tags', [filter.tag])
    if (filter.bookId) q = q.eq('book_id', filter.bookId)
    if (filter.mastery === 'new') q = q.eq('mastery_level', 0)
    if (filter.mastery === 'learning') q = q.gte('mastery_level', 1).lte('mastery_level', 4)
    if (filter.mastery === 'mastered') q = q.gte('mastery_level', 5)

    if (filter.sort === 'oldest') q = q.order('created_at', { ascending: true })
    else if (filter.sort === 'review') q = q.order('next_review_at', { ascending: true })
    else q = q.order('created_at', { ascending: false })

    const { data, error } = await q
    if (error) throw error
    return (data ?? []) as Word[]
  })
}

export async function fetchWord(id: string): Promise<Word> {
  const { data, error } = await supabase.from('words').select('*').eq('id', id).single()
  if (error) throw error
  return data as Word
}

export async function createWord(fields: WordInsert): Promise<Word> {
  // 显式带上当前登录用户 id，避免 user_id 为空被 RLS 拒绝（数据库里也配了 auth.uid() 默认值兜底）
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('words')
    .insert({ ...fields, user_id: user?.id })
    .select()
    .single()
  if (error) {
    if (error.code === '23505') throw new Error(`"${fields.word}" is already in your library.`)
    throw error
  }
  // 数据已变：使相关缓存失效
  invalidateCache('words')
  invalidateCache('dashboard')
  invalidateCache('books')
  invalidateCache('tags')
  return data as Word
}

export async function updateWord(id: string, fields: Partial<WordInsert>): Promise<Word> {
  const { data, error } = await supabase
    .from('words')
    .update(fields)
    .eq('id', id)
    .select()
    .single()
  if (error) throw error
  invalidateCache('words')
  invalidateCache('tags')
  return data as Word
}

export async function deleteWord(id: string): Promise<void> {
  const { error } = await supabase.from('words').delete().eq('id', id)
  if (error) throw error
  invalidateCache('words')
  invalidateCache('dashboard')
  invalidateCache('books')
  invalidateCache('tags')
}

export async function fetchAllTags(): Promise<string[]> {
  return cachedFetch('tags', async () => {
    const { data, error } = await supabase.from('words').select('tags')
    if (error) throw error
    const set = new Set<string>()
    for (const row of data ?? []) for (const t of (row.tags as string[]) ?? []) set.add(t)
    return [...set].sort()
  })
}

export async function fetchReviewLogs(wordId: string): Promise<ReviewLog[]> {
  const { data, error } = await supabase
    .from('review_logs')
    .select('*')
    .eq('word_id', wordId)
    .order('reviewed_at', { ascending: false })
    .limit(50)
  if (error) throw error
  return (data ?? []) as ReviewLog[]
}

/** 看板统计：今日待复习 / 已复习 / 正确率 / 连续打卡 / 已掌握 / 总数（30s 缓存，写操作自动失效） */
export async function fetchDashboardStats(): Promise<DashboardStats> {
  return cachedFetch('dashboard', async () => {
    const todayStart = dayjs().startOf('day').toISOString()

    const [wordsRes, dueRes, todayLogsRes, allLogsRes] = await Promise.all([
      supabase.from('words').select('id, mastery_level', { count: 'exact' }),
      supabase
        .from('words')
        .select('id', { count: 'exact', head: true })
        .lte('next_review_at', dayjs().toISOString()),
      supabase.from('review_logs').select('feedback').gte('reviewed_at', todayStart),
      supabase.from('review_logs').select('reviewed_at').order('reviewed_at', { ascending: false }).limit(500),
    ])

    if (wordsRes.error) throw wordsRes.error
    if (dueRes.error) throw dueRes.error
    if (todayLogsRes.error) throw todayLogsRes.error
    if (allLogsRes.error) throw allLogsRes.error

    const todayLogs = todayLogsRes.data ?? []
    const reviewedToday = todayLogs.length
    const correctToday = todayLogs.filter((l) => l.feedback === 'know').length

    // 连续打卡：有复习记录的不同日期，从今天/昨天往前连续计数
    const days = new Set(
      (allLogsRes.data ?? []).map((l) => dayjs(l.reviewed_at as string).format('YYYY-MM-DD')),
    )
    let streakDays = 0
    let cursor = days.has(dayjs().format('YYYY-MM-DD')) ? dayjs() : dayjs().subtract(1, 'day')
    while (days.has(cursor.format('YYYY-MM-DD'))) {
      streakDays++
      cursor = cursor.subtract(1, 'day')
    }

    const masteredCount = (wordsRes.data ?? []).filter(
      (w) => (w.mastery_level as number) >= 5,
    ).length

    return {
      dueToday: dueRes.count ?? 0,
      reviewedToday,
      accuracyToday: reviewedToday ? correctToday / reviewedToday : 0,
      streakDays,
      masteredCount,
      totalCount: wordsRes.count ?? 0,
    }
  })
}
