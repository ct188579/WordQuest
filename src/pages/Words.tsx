import { useCallback, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Search, Plus, Trash2, ChevronLeft, ChevronRight } from 'lucide-react'
import gsap from 'gsap'
import { fetchAllTags, fetchWordsPage, type WordFilter } from '../services/words'
import {
  fetchBooks,
  createBook,
  deleteBook,
  ensureDefaultBook,
  type BookWithCount,
} from '../services/books'
import { describeNextReview } from '../services/review'
import { useT, LANGUAGES } from '../i18n'
import type { Word } from '../types'
import { Input } from '../components/ui/input'
import { Badge } from '../components/ui/badge'
import { Card } from '../components/ui/card'
import { Button } from '../components/ui/button'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { cn } from '../lib/utils'

const MASTERY_TABS = [
  { key: 'all', labelKey: 'words.fAll' },
  { key: 'new', labelKey: 'words.fNew' },
  { key: 'learning', labelKey: 'words.fLearning' },
  { key: 'mastered', labelKey: 'words.fMastered' },
] as const

// ---------- 每页条数：按屏幕高度估算（卡片约 112px + 顶部固定区域约 330px） ----------
const ITEM_HEIGHT = 112
const RESERVED_HEIGHT = 330
const MIN_PAGE_SIZE = 3
const MAX_PAGE_SIZE = 15

function computePageSize(): number {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const size = Math.floor((vh - RESERVED_HEIGHT) / ITEM_HEIGHT)
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, size))
}

/** 生成页码序列（含省略号）：1 … 4 5 6 … 10 */
function pageNumbers(current: number, totalPages: number): (number | '...')[] {
  if (totalPages <= 7) return Array.from({ length: totalPages }, (_, i) => i)
  const set = new Set<number>(
    [0, 1, totalPages - 2, totalPages - 1, current - 1, current, current + 1].filter(
      (n) => n >= 0 && n < totalPages,
    ),
  )
  const sorted = [...set].sort((a, b) => a - b)
  const out: (number | '...')[] = []
  let prev = -2
  for (const n of sorted) {
    if (n - prev > 1) out.push('...')
    out.push(n)
    prev = n
  }
  return out
}

export default function Words() {
  const t = useT()
  const [words, setWords] = useState<Word[]>([])
  const [books, setBooks] = useState<BookWithCount[]>([])
  const [activeBookId, setActiveBookId] = useState<string | null>(null) // null = 全部单词本
  const [tags, setTags] = useState<string[]>([])
  const [search, setSearch] = useState('')
  const [tag, setTag] = useState<string | null>(null)
  const [mastery, setMastery] = useState<WordFilter['mastery']>('all')
  const [sort, setSort] = useState<WordFilter['sort']>('newest')
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(computePageSize)
  const [total, setTotal] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // 单词本管理弹窗
  const [bookDialog, setBookDialog] = useState(false)
  const [newBookName, setNewBookName] = useState('')
  const [newBookLang, setNewBookLang] = useState('en')

  const loadBooks = () => fetchBooks().then(setBooks).catch(console.error)

  useEffect(() => {
    // 首次进入：确保有默认单词本并迁移孤儿单词，再加载
    ensureDefaultBook()
      .catch(console.error)
      .finally(() => {
        loadBooks()
        fetchAllTags().then(setTags).catch(console.error)
      })
  }, [])

  // 屏幕尺寸变化 → 重新计算每页条数（变化时触发重新加载第 1 页）
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setPageSize(computePageSize()), 150)
    }
    window.addEventListener('resize', onResize)
    return () => {
      clearTimeout(timer)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  // 取某一页数据
  const fetchPage = useCallback(
    async (p: number) => {
      setLoading(true)
      try {
        const res = await fetchWordsPage(
          { search, tag, bookId: activeBookId, mastery, sort },
          p,
          pageSize,
        )
        setWords(res.words)
        setTotal(res.total)
        setPage(p)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    },
    [search, tag, activeBookId, mastery, sort, pageSize],
  )

  // 筛选条件 / 每页条数变化 → 回到第 1 页重新加载（250ms 搜索防抖）
  useEffect(() => {
    const timer = setTimeout(() => fetchPage(0), 250)
    return () => clearTimeout(timer)
  }, [fetchPage])

  // 列表交错入场动画（每页都播，切换页有轻快感）
  useEffect(() => {
    if (loading || !listRef.current) return
    gsap.fromTo(
      listRef.current.children,
      { opacity: 0, x: -16 },
      { opacity: 1, x: 0, duration: 0.3, stagger: 0.04, ease: 'power2.out' },
    )
  }, [loading, words])

  const handleCreateBook = async () => {
    if (!newBookName.trim()) return
    await createBook(newBookName, newBookLang).catch(console.error)
    setNewBookName('')
    await loadBooks()
  }

  const handleDeleteBook = async (id: string) => {
    await deleteBook(id).catch(console.error)
    if (activeBookId === id) setActiveBookId(null)
    await loadBooks()
  }

  const masteryBadge = (w: Word) => {
    if (w.mastery_level >= 5) return <Badge variant="green">{t('words.fMastered')}</Badge>
    if (w.mastery_level >= 1) return <Badge variant="yellow">Lv.{w.mastery_level}</Badge>
    return <Badge variant="gray">{t('words.fNew')}</Badge>
  }

  // ---------- 分页器 ----------
  const totalPages = Math.max(1, Math.ceil(total / pageSize))
  const goTo = (p: number) => {
    if (p >= 0 && p < totalPages && p !== page) fetchPage(p)
  }
  const pageBtnCls = (active: boolean) =>
    cn(
      'flex h-9 w-9 cursor-pointer items-center justify-center rounded-xl text-sm font-extrabold transition-colors',
      active ? 'bg-duo text-white' : 'text-ink-soft hover:bg-gray-100',
    )

  return (
    <div className="flex flex-col gap-4">
      <h1 className="text-2xl font-black text-ink">{t('words.title')}</h1>

      <div className="relative">
        <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" />
        <Input
          className="pl-11"
          placeholder={t('words.search')}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* 单词本筛选（横向滚动） */}
      <div className="scrollbar-none flex gap-2 overflow-x-auto pb-1">
        <Badge
          variant={activeBookId === null ? 'green' : 'gray'}
          className="shrink-0"
          onClick={() => setActiveBookId(null)}
        >
          📚 {t('books.all')}
        </Badge>
        {books.map((b) => (
          <Badge
            key={b.id}
            variant={activeBookId === b.id ? 'green' : 'gray'}
            className="shrink-0"
            onClick={() => setActiveBookId(activeBookId === b.id ? null : b.id)}
          >
            {b.name} · {b.word_count}
          </Badge>
        ))}
        <Badge variant="blue" className="shrink-0" onClick={() => setBookDialog(true)}>
          <Plus size={12} className="mr-0.5" /> {t('books.new')}
        </Badge>
      </div>

      {/* 掌握程度 + 排序 */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex gap-1.5">
          {MASTERY_TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => setMastery(tab.key)}
              className={cn(
                'rounded-full px-3 py-1.5 text-xs font-extrabold uppercase cursor-pointer transition-colors',
                mastery === tab.key
                  ? 'bg-duo text-white'
                  : 'bg-gray-100 text-ink-soft hover:bg-gray-200',
              )}
            >
              {t(tab.labelKey)}
            </button>
          ))}
        </div>
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as WordFilter['sort'])}
          className="rounded-xl border-2 border-gray-200 bg-white px-2 py-1.5 text-xs font-bold text-ink-soft outline-none"
        >
          <option value="newest">{t('words.sNewest')}</option>
          <option value="oldest">{t('words.sOldest')}</option>
          <option value="review">{t('words.sDue')}</option>
        </select>
      </div>

      {/* 标签筛选 */}
      {tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          <Badge variant={tag === null ? 'blue' : 'gray'} onClick={() => setTag(null)}>
            {t('words.allTags')}
          </Badge>
          {tags.map((tg) => (
            <Badge
              key={tg}
              variant={tag === tg ? 'blue' : 'gray'}
              onClick={() => setTag(tag === tg ? null : tg)}
            >
              #{tg}
            </Badge>
          ))}
        </div>
      )}

      {loading ? (
        <p className="py-10 text-center font-bold text-ink-soft">{t('common.loading')}</p>
      ) : words.length === 0 ? (
        <p className="py-10 text-center font-bold text-ink-soft">{t('words.empty')}</p>
      ) : (
        <div ref={listRef} className="flex flex-col gap-2.5">
          {words.map((w) => (
            <Link key={w.id} to={`/words/${w.id}`}>
              <Card className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-duo-blue">
                <div className="min-w-0">
                  <div className="flex items-baseline gap-2">
                    <span className="truncate text-lg font-black text-ink">{w.word}</span>
                    <span className="shrink-0 text-xs font-bold text-ink-soft">{w.phonetic}</span>
                  </div>
                  <p className="truncate text-sm font-semibold text-ink-soft">{w.meaning_cn}</p>
                  <p className="mt-0.5 text-xs font-bold text-duo-blue-dark">
                    {t('words.next')} {describeNextReview(w.next_review_at)}
                  </p>
                </div>
                {masteryBadge(w)}
              </Card>
            </Link>
          ))}
        </div>
      )}

      {/* 分页器 */}
      {!loading && words.length > 0 && totalPages > 1 && (
        <div className="flex items-center justify-center gap-1.5 py-2">
          <button
            onClick={() => goTo(page - 1)}
            disabled={page === 0}
            className={cn(pageBtnCls(false), 'disabled:cursor-not-allowed disabled:opacity-30')}
            aria-label={t('words.prev')}
          >
            <ChevronLeft size={18} />
          </button>
          {pageNumbers(page, totalPages).map((n, i) =>
            n === '...' ? (
              <span key={`e${i}`} className="px-1 text-sm font-bold text-gray-400">
                …
              </span>
            ) : (
              <button key={n} onClick={() => goTo(n)} className={pageBtnCls(n === page)}>
                {n + 1}
              </button>
            ),
          )}
          <button
            onClick={() => goTo(page + 1)}
            disabled={page >= totalPages - 1}
            className={cn(pageBtnCls(false), 'disabled:cursor-not-allowed disabled:opacity-30')}
            aria-label={t('words.next')}
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}
      {!loading && words.length > 0 && (
        <p className="pb-1 text-center text-xs font-bold text-gray-400">
          {total} {t('words.allShown')}
        </p>
      )}

      {/* 单词本管理弹窗：创建 + 删除 */}
      <Dialog open={bookDialog} onOpenChange={setBookDialog}>
        <DialogContent>
          <DialogTitle>{t('books.manage')}</DialogTitle>

          <div className="mt-4 flex flex-col gap-3">
            <Input
              placeholder={t('books.name')}
              value={newBookName}
              onChange={(e) => setNewBookName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleCreateBook()}
            />
            <div className="flex flex-wrap gap-2">
              {LANGUAGES.map((l) => (
                <Badge
                  key={l.code}
                  variant={newBookLang === l.code ? 'blue' : 'gray'}
                  onClick={() => setNewBookLang(l.code)}
                >
                  {l.native}
                </Badge>
              ))}
            </div>
            <Button onClick={handleCreateBook} disabled={!newBookName.trim()}>
              <Plus size={16} /> {t('common.create')}
            </Button>
          </div>

          <div className="mt-5 flex flex-col gap-2">
            {books.length === 0 ? (
              <p className="text-sm font-bold text-ink-soft">{t('books.empty')}</p>
            ) : (
              books.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-xl bg-gray-50 px-3 py-2.5"
                >
                  <span className="text-sm font-bold text-ink">
                    {b.name}
                    <span className="ml-2 text-xs font-bold text-ink-soft">
                      {LANGUAGES.find((l) => l.code === b.language)?.native ?? b.language} ·{' '}
                      {b.word_count}
                    </span>
                  </span>
                  <button
                    onClick={() => handleDeleteBook(b.id)}
                    className="cursor-pointer rounded-full p-1.5 text-duo-red hover:bg-duo-red/10"
                    aria-label={t('common.delete')}
                  >
                    <Trash2 size={16} />
                  </button>
                </div>
              ))
            )}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
