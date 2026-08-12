import { supabase } from '../lib/supabase'
import { cachedFetch, invalidateCache } from './cache'
import type { Book } from '../types'

// ============================================================
// 单词本（books）：不同语言的词库容器
// ============================================================

export interface BookWithCount extends Book {
  word_count: number
}

/** 按 id 取单个单词本（找不到返回 null） */
export async function fetchBook(id: string): Promise<Book | null> {
  const { data, error } = await supabase.from('books').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  return (data as Book | null) ?? null
}

/** 取全部单词本（附带单词数，带缓存，写操作自动失效） */
export async function fetchBooks(): Promise<BookWithCount[]> {
  return cachedFetch('books', async () => {
    const [booksRes, wordsRes] = await Promise.all([
      supabase.from('books').select('*').order('created_at', { ascending: true }),
      supabase.from('words').select('book_id'),
    ])
    if (booksRes.error) throw booksRes.error
    if (wordsRes.error) throw wordsRes.error

    const counts = new Map<string, number>()
    for (const w of wordsRes.data ?? []) {
      const id = w.book_id as string | null
      if (id) counts.set(id, (counts.get(id) ?? 0) + 1)
    }
    return (booksRes.data ?? []).map((b) => ({
      ...(b as Book),
      word_count: counts.get((b as Book).id) ?? 0,
    }))
  })
}

/** 创建单词本 */
export async function createBook(name: string, language: string): Promise<Book> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('books')
    .insert({ name: name.trim(), language, user_id: user?.id })
    .select()
    .single()
  if (error) throw error
  invalidateCache('books')
  invalidateCache('words')
  invalidateCache('dashboard')
  return data as Book
}

/** 删除单词本（words.book_id 是 on delete set null，单词会保留并移出） */
export async function deleteBook(id: string): Promise<void> {
  const { error } = await supabase.from('books').delete().eq('id', id)
  if (error) throw error
  invalidateCache('books')
  invalidateCache('words')
  invalidateCache('dashboard')
}

/**
 * 确保存在默认单词本：
 * - 没有任何单词本时，自动创建一个 English 默认本
 * - 把历史遗留的 book_id 为空的单词归入默认本（一次性迁移，幂等）
 * - 会话级保护：整个会话只真正执行一次，之后直接返回，避免每次进词库页都发请求
 */
let defaultBookEnsured = false

export async function ensureDefaultBook(): Promise<Book | null> {
  if (defaultBookEnsured) return null

  const { data: books, error } = await supabase
    .from('books')
    .select('*')
    .order('created_at', { ascending: true })
    .limit(1)
  if (error) throw error

  let book = (books?.[0] as Book | undefined) ?? null
  if (!book) {
    book = await createBook('English', 'en')
  }
  // 孤儿单词归入默认本
  await supabase.from('words').update({ book_id: book.id }).is('book_id', null)

  defaultBookEnsured = true
  return book
}
