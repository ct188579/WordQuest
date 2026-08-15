import { supabase } from '../lib/supabase'
import { cachedFetch, invalidateCache } from './cache'
import type { Favorite, FavoriteInsert, FavoriteKind } from '../types'

// ============================================================
// 收藏本（favorites）：短语 / 句子分类收藏
// 服务端分页 + 分类计数，缓存 key 统一以 'favorites' 前缀
// （增删改会 invalidateCache('favorites') 一并失效）
// ============================================================

export const FAVORITES_PAGE_SIZE = 12

export type FavoriteFilter = 'all' | FavoriteKind

export interface FavoritePage {
  items: Favorite[]
  total: number
}

/** 分页查询收藏（按分类筛选，创建时间倒序） */
export async function fetchFavoritesPage(
  filter: FavoriteFilter = 'all',
  page = 0,
  pageSize: number = FAVORITES_PAGE_SIZE,
): Promise<FavoritePage> {
  return cachedFetch(`favorites:page:${filter}:p${page}:s${pageSize}`, async () => {
    let q = supabase.from('favorites').select('*', { count: 'exact' })
    if (filter !== 'all') q = q.eq('kind', filter)
    q = q.order('created_at', { ascending: false }).range(page * pageSize, page * pageSize + pageSize - 1)
    const { data, error, count } = await q
    if (error) throw error
    return { items: (data ?? []) as Favorite[], total: count ?? 0 }
  })
}

/** 分类计数（顶部筛选 chips 用，轻量 head 查询） */
export async function countFavorites(filter: FavoriteFilter = 'all'): Promise<number> {
  return cachedFetch(`favorites:count:${filter}`, async () => {
    let q = supabase.from('favorites').select('id', { count: 'exact', head: true })
    if (filter !== 'all') q = q.eq('kind', filter)
    const { count, error } = await q
    if (error) throw error
    return count ?? 0
  })
}

/** 添加一条收藏（短语或句子） */
export async function addFavorite(fields: FavoriteInsert): Promise<Favorite> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  const { data, error } = await supabase
    .from('favorites')
    .insert({
      kind: fields.kind,
      content: fields.content.trim(),
      translation: fields.translation?.trim() || null,
      note: fields.note?.trim() || null,
      source_word_id: fields.source_word_id ?? null,
      user_id: user?.id,
    })
    .select()
    .single()
  if (error) throw error
  invalidateCache('favorites')
  return data as Favorite
}

/** 删除一条收藏 */
export async function deleteFavorite(id: string): Promise<void> {
  const { error } = await supabase.from('favorites').delete().eq('id', id)
  if (error) throw error
  invalidateCache('favorites')
}
