import { useCallback, useEffect, useRef, useState } from 'react'
import { Star, Plus, Trash2, Type, MessageSquareQuote, Sparkles } from 'lucide-react'
import gsap from 'gsap'
import {
  fetchFavoritesPage,
  countFavorites,
  addFavorite,
  deleteFavorite,
  type FavoriteFilter,
} from '../services/favorites'
import { translateText } from '../services/ai'
import { useT } from '../i18n'
import type { Favorite, FavoriteKind } from '../types'
import { Button } from '../components/ui/button'
import { Input, Textarea } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Badge } from '../components/ui/badge'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { Paginator } from '../components/Paginator'
import { computePageSize } from '../lib/pageSize'
import { cn } from '../lib/utils'

// 每页条数：按屏幕高度估算（收藏卡片略高约 130px + 顶部固定区域约 300px）
const pageSizeFor = () => computePageSize(130, 300)

export default function Favorites() {
  const t = useT()
  const [filter, setFilter] = useState<FavoriteFilter>('all')
  const [items, setItems] = useState<Favorite[]>([])
  const [counts, setCounts] = useState<{ all: number; phrase: number; sentence: number }>({
    all: 0,
    phrase: 0,
    sentence: 0,
  })
  const [loading, setLoading] = useState(true)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState(pageSizeFor)
  const [total, setTotal] = useState(0)
  const listRef = useRef<HTMLDivElement>(null)

  // 添加弹窗
  const [dialog, setDialog] = useState(false)
  const [form, setForm] = useState<{
    kind: FavoriteKind
    content: string
    translation: string
    note: string
  }>({ kind: 'sentence', content: '', translation: '', note: '' })
  const [saving, setSaving] = useState(false)
  const [aiTranslating, setAiTranslating] = useState(false)
  const [error, setError] = useState<string | null>(null)
  // 删除确认弹窗
  const [deleteTarget, setDeleteTarget] = useState<Favorite | null>(null)
  const [deleting, setDeleting] = useState(false)

  const loadCounts = useCallback(() => {
    Promise.all([countFavorites('all'), countFavorites('phrase'), countFavorites('sentence')])
      .then(([all, phrase, sentence]) => setCounts({ all, phrase, sentence }))
      .catch(console.error)
  }, [])

  useEffect(loadCounts, [loadCounts])

  // 屏幕尺寸变化 → 重新计算每页条数（150ms 防抖），变化时回到第 1 页
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>
    const onResize = () => {
      clearTimeout(timer)
      timer = setTimeout(() => setPageSize(pageSizeFor()), 150)
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
        const res = await fetchFavoritesPage(filter, p, pageSize)
        setItems(res.items)
        setTotal(res.total)
        setPage(p)
      } catch (e) {
        console.error(e)
      } finally {
        setLoading(false)
      }
    },
    [filter, pageSize],
  )

  // 筛选 / 每页条数变化 → 回到第 1 页
  useEffect(() => {
    const timer = setTimeout(() => fetchPage(0), 0)
    return () => clearTimeout(timer)
  }, [fetchPage])

  // 列表交错入场
  useEffect(() => {
    if (loading || !listRef.current) return
    gsap.fromTo(
      listRef.current.children,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.32, stagger: 0.04, ease: 'power2.out' },
    )
  }, [loading, items])

  /** 手动点按钮触发 AI 翻译并填入输入框 */
  const autoTranslate = async () => {
    const content = form.content.trim()
    if (!content || aiTranslating) return
    setAiTranslating(true)
    setError(null)
    try {
      const translation = await translateText(content)
      setForm((f) => ({ ...f, translation }))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translate failed.')
    } finally {
      setAiTranslating(false)
    }
  }

  /** 保存：用户填了翻译用用户的，没填则自动调 AI 翻译 */
  const handleAdd = async () => {
    const content = form.content.trim()
    if (!content) return
    setSaving(true)
    setError(null)

    let translation = form.translation.trim()
    if (!translation) {
      setAiTranslating(true)
      try {
        translation = await translateText(content)
      } catch {
        translation = '' // 翻译失败不阻塞保存，存为空翻译
      }
      setAiTranslating(false)
    }

    try {
      await addFavorite({ kind: form.kind, content, translation, note: form.note })
      setDialog(false)
      setForm({ kind: 'sentence', content: '', translation: '', note: '' })
      loadCounts()
      fetchPage(0) // 回到第 1 页，新收藏排在最前
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to save.')
      setSaving(false)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string) => {
    setDeleting(true)
    try {
      await deleteFavorite(id)
      setDeleteTarget(null)
      loadCounts()
      fetchPage(page)
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(false)
    }
  }

  const kindBadge = (kind: FavoriteKind) =>
    kind === 'phrase' ? (
      <Badge variant="yellow">
        <Type size={11} className="mr-0.5" /> {t('fav.phrases')}
      </Badge>
    ) : (
      <Badge variant="blue">
        <MessageSquareQuote size={11} className="mr-0.5" /> {t('fav.sentences')}
      </Badge>
    )

  const TAB_BTN = (active: boolean) =>
    cn(
      'rounded-full px-4 py-1.5 text-xs font-extrabold uppercase cursor-pointer transition-colors',
      active ? 'bg-duo text-white' : 'bg-gray-100 text-ink-soft hover:bg-gray-200',
    )

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-black text-ink">
          <Star size={24} className="text-duo-yellow-dark" fill="currentColor" /> {t('fav.title')}
        </h1>
        <Button size="sm" onClick={() => setDialog(true)}>
          <Plus size={16} /> {t('fav.add')}
        </Button>
      </div>

      {/* 分类筛选（带计数） */}
      <div className="flex flex-wrap gap-2">
        <button className={TAB_BTN(filter === 'all')} onClick={() => setFilter('all')}>
          {t('fav.all')} ({counts.all})
        </button>
        <button className={TAB_BTN(filter === 'phrase')} onClick={() => setFilter('phrase')}>
          {t('fav.phrases')} ({counts.phrase})
        </button>
        <button className={TAB_BTN(filter === 'sentence')} onClick={() => setFilter('sentence')}>
          {t('fav.sentences')} ({counts.sentence})
        </button>
      </div>

      {loading ? (
        <p className="py-10 text-center font-bold text-ink-soft">{t('common.loading')}</p>
      ) : items.length === 0 ? (
        <p className="py-10 text-center font-bold text-ink-soft">{t('fav.empty')}</p>
      ) : (
        <div ref={listRef} className="flex flex-col gap-2.5">
          {items.map((item) => (
            <Card key={item.id} className="group flex items-start justify-between gap-3 p-4">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  {kindBadge(item.kind)}
                  <span className="text-[11px] font-bold text-gray-400">
                    {new Date(item.created_at).toLocaleDateString()}
                  </span>
                </div>
                <p className="mt-1.5 font-black text-ink">{item.content}</p>
                {item.translation && (
                  <p className="mt-0.5 text-sm font-semibold text-ink-soft">{item.translation}</p>
                )}
                {item.note && (
                  <p className="mt-1.5 rounded-lg bg-paper px-2.5 py-1.5 text-xs font-bold text-ink-soft">
                    {item.note}
                  </p>
                )}
              </div>
              <button
                onClick={() => setDeleteTarget(item)}
                className="cursor-pointer rounded-full p-1.5 text-gray-300 transition-colors hover:bg-duo-red/10 hover:text-duo-red"
                aria-label={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* 分页器 + 总数 */}
      {!loading && items.length > 0 && (
        <>
          <Paginator
            page={page}
            totalPages={Math.max(1, Math.ceil(total / pageSize))}
            onGoTo={fetchPage}
          />
          <p className="pb-1 text-center text-xs font-bold text-gray-400">
            {total} {t('words.allShown')}
          </p>
        </>
      )}

      {/* 添加收藏弹窗 */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogTitle>{t('fav.add')}</DialogTitle>
          <div className="mt-4 flex flex-col gap-3">
            {/* 类型选择 */}
            <div className="flex gap-2">
              <button
                onClick={() => setForm({ ...form, kind: 'phrase' })}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 px-3 py-2.5 text-sm font-extrabold transition-colors',
                  form.kind === 'phrase'
                    ? 'border-duo-yellow bg-duo-yellow/10 text-duo-yellow-dark'
                    : 'border-gray-200 text-ink-soft hover:border-gray-300',
                )}
              >
                <Type size={16} /> {t('fav.phrases')}
              </button>
              <button
                onClick={() => setForm({ ...form, kind: 'sentence' })}
                className={cn(
                  'flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-2xl border-2 px-3 py-2.5 text-sm font-extrabold transition-colors',
                  form.kind === 'sentence'
                    ? 'border-duo-blue bg-duo-blue/10 text-duo-blue-dark'
                    : 'border-gray-200 text-ink-soft hover:border-gray-300',
                )}
              >
                <MessageSquareQuote size={16} /> {t('fav.sentences')}
              </button>
            </div>

            <Textarea
              placeholder={t('fav.contentPh')}
              value={form.content}
              onChange={(e) => setForm({ ...form, content: e.target.value })}
              rows={2}
            />

            {/* 翻译：可手动填，也可点 ✨ 自动翻译 */}
            <div className="flex gap-2">
              <Input
                placeholder={t('fav.translation')}
                value={form.translation}
                onChange={(e) => setForm({ ...form, translation: e.target.value })}
              />
              <Button
                variant="outline"
                onClick={autoTranslate}
                disabled={aiTranslating || !form.content.trim()}
                title={t('fav.autoTranslate')}
              >
                <Sparkles size={15} className="text-duo-blue" />
              </Button>
            </div>

            <Input
              placeholder={t('fav.note')}
              value={form.note}
              onChange={(e) => setForm({ ...form, note: e.target.value })}
            />
            {error && <p className="text-sm font-bold text-duo-red">{error}</p>}
            <Button onClick={handleAdd} disabled={saving || !form.content.trim()}>
              {aiTranslating
                ? t('fav.translating')
                : saving
                  ? t('common.loading')
                  : t('fav.save')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogTitle>{t('fav.deleteTitle')}</DialogTitle>
          {deleteTarget && (
            <p className="mt-2 rounded-xl bg-paper px-3 py-2.5 font-bold text-ink">
              {deleteTarget.content}
            </p>
          )}
          <p className="mt-1 font-semibold text-ink-soft">{t('fav.deleteMsg')}</p>
          <div className="mt-5 flex gap-2">
            <Button
              variant="danger"
              className="flex-1"
              disabled={deleting}
              onClick={() => deleteTarget && handleDelete(deleteTarget.id)}
            >
              {deleting ? t('common.loading') : t('common.delete')}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
