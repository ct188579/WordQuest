// ============================================================
// 轻量数据缓存（仅内存，刷新页面即失效）
//  - 页面间跳转命中缓存，避免重复请求 Supabase
//  - 写操作（增删改）调用 invalidateCache 主动失效，保证数据新鲜
// ============================================================

const store = new Map<string, { data: unknown; ts: number }>()
// 默认 5 分钟。写操作（增删改）会自动 invalidateCache，所以 TTL 只是兜底
const DEFAULT_TTL = 5 * 60_000

/** 带缓存的取数：命中且未过期直接返回，否则请求并写入缓存 */
export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  ttlMs: number = DEFAULT_TTL,
): Promise<T> {
  const hit = store.get(key)
  if (hit && Date.now() - hit.ts < ttlMs) return hit.data as T
  const data = await fetcher()
  store.set(key, { data, ts: Date.now() })
  return data
}

/** 按 key 前缀失效缓存（写操作后调用，例如 invalidateCache('words')） */
export function invalidateCache(prefix: string): void {
  for (const key of store.keys()) {
    if (key.startsWith(prefix)) store.delete(key)
  }
}

/** 清空全部缓存（例如登出时） */
export function clearCache(): void {
  store.clear()
}
