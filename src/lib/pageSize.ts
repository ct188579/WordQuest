// ============================================================
// 根据屏幕高度估算每页条数（词库 / 收藏等列表页共用）
// ============================================================

const MIN_PAGE_SIZE = 3
const MAX_PAGE_SIZE = 15

/** itemHeight: 单条卡片约高；reserved: 顶部固定区域（标题/筛选/分页器等）约高 */
export function computePageSize(itemHeight = 112, reserved = 330): number {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const size = Math.floor((vh - reserved) / itemHeight)
  return Math.min(MAX_PAGE_SIZE, Math.max(MIN_PAGE_SIZE, size))
}
