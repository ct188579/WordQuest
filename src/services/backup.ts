import { supabase } from '../lib/supabase'
import { invalidateCache } from './cache'
import type { Book, ReviewLog, Word } from '../types'

// ============================================================
// 数据备份：导出全部数据为 JSON，导入时写回 Supabase
// 导入策略：单词本按「名称+语言」去重复用；单词逐条插入，已存在的跳过；
//           复习日志只导入能映射到新单词的记录（跨单词本的关联）
// ============================================================

export interface BackupFile {
  app: 'wordquest'
  version: 1
  exportedAt: string
  books: Book[]
  words: Word[]
  review_logs: ReviewLog[]
}

export interface ImportResult {
  books: number
  words: number
  skippedWords: number
  logs: number
  droppedLogs: number
}

export function isValidBackup(x: unknown): x is BackupFile {
  const b = x as BackupFile
  return Boolean(
    b &&
      b.app === 'wordquest' &&
      Array.isArray(b.books) &&
      Array.isArray(b.words) &&
      Array.isArray(b.review_logs),
  )
}

/** 拉取当前账号全部数据 */
export async function exportData(): Promise<BackupFile> {
  const [booksRes, wordsRes, logsRes] = await Promise.all([
    supabase.from('books').select('*').order('created_at', { ascending: true }),
    supabase.from('words').select('*').order('created_at', { ascending: true }),
    supabase.from('review_logs').select('*').order('reviewed_at', { ascending: true }),
  ])
  if (booksRes.error) throw booksRes.error
  if (wordsRes.error) throw wordsRes.error
  if (logsRes.error) throw logsRes.error

  return {
    app: 'wordquest',
    version: 1,
    exportedAt: new Date().toISOString(),
    books: (booksRes.data ?? []) as Book[],
    words: (wordsRes.data ?? []) as Word[],
    review_logs: (logsRes.data ?? []) as ReviewLog[],
  }
}

/** 生成备份文件名并触发浏览器下载 */
export function downloadBackup(data: BackupFile): void {
  const stamp = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, '')
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wordquest-backup-${stamp}.json`
  a.click()
  URL.revokeObjectURL(url)
}

/** 导入备份数据到 Supabase，返回统计 */
export async function importData(file: BackupFile): Promise<ImportResult> {
  const result: ImportResult = { books: 0, words: 0, skippedWords: 0, logs: 0, droppedLogs: 0 }

  // ---------- 1. 单词本（名称+语言 去重复用） ----------
  const { data: existingBooks } = await supabase.from('books').select('id, name, language')
  const existingMap = new Map(
    (existingBooks ?? []).map((b) => [`${b.name}|${b.language}`, b.id as string]),
  )
  const bookIdMap = new Map<string, string>() // 旧 book_id → 新 book_id
  for (const b of file.books ?? []) {
    const key = `${b.name}|${b.language}`
    const hit = existingMap.get(key)
    if (hit) {
      bookIdMap.set(b.id, hit)
      continue
    }
    const { data, error } = await supabase
      .from('books')
      .insert({ name: b.name, language: b.language })
      .select('id')
      .single()
    if (error) {
      console.error('[import] book', error)
      continue
    }
    bookIdMap.set(b.id, (data as { id: string }).id)
    result.books++
  }

  // ---------- 2. 单词（逐条插入，已存在跳过；保留复习进度字段） ----------
  const wordIdMap = new Map<string, string>() // 旧 word_id → 新 word_id
  for (const w of file.words ?? []) {
    const row = {
      book_id: w.book_id ? (bookIdMap.get(w.book_id) ?? null) : null,
      word: w.word,
      phonetic: w.phonetic,
      meaning_cn: w.meaning_cn,
      meaning_en: w.meaning_en,
      part_of_speech: w.part_of_speech,
      example_sentences: w.example_sentences,
      root_affix: w.root_affix,
      notes: w.notes,
      tags: w.tags,
      mastery_level: w.mastery_level,
      ease_factor: w.ease_factor,
      interval_days: w.interval_days,
      next_review_at: w.next_review_at,
      review_count: w.review_count,
      correct_count: w.correct_count,
    }
    const { data, error } = await supabase.from('words').insert(row).select('id').single()
    if (error) {
      // 23505 = 已存在（user_id + word 唯一约束）
      result.skippedWords++
      console.error('[import] word', w.word, error.code ?? error.message)
      continue
    }
    wordIdMap.set(w.id, (data as { id: string }).id)
    result.words++
  }

  // ---------- 3. 复习日志（只导入能映射到新单词的，分批写入） ----------
  const logRows: Record<string, unknown>[] = []
  for (const l of file.review_logs ?? []) {
    const wid = wordIdMap.get(l.word_id)
    if (!wid) {
      result.droppedLogs++
      continue
    }
    logRows.push({
      word_id: wid,
      feedback: l.feedback,
      stage_before: l.stage_before,
      stage_after: l.stage_after,
      reviewed_at: l.reviewed_at,
    })
  }
  for (let i = 0; i < logRows.length; i += 100) {
    const { error } = await supabase.from('review_logs').insert(logRows.slice(i, i + 100))
    if (error) {
      console.error('[import] logs', error)
      result.droppedLogs += logRows.length - i
    } else {
      result.logs += logRows.length - i
    }
  }

  // 数据已变：使所有相关缓存失效
  invalidateCache('words')
  invalidateCache('books')
  invalidateCache('dashboard')
  invalidateCache('tags')
  invalidateCache('due')

  return result
}
