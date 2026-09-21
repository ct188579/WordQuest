// ============================================================
// 根据屏幕高度估算每页条数（词库 / 收藏等列表页共用）
// ============================================================

const MIN_ROWS = 1
const MAX_PAGE_SIZE = 18

/**
 * itemHeight: 单条卡片约高；reserved: 顶部固定区域（标题/筛选/分页器等）约高；cols: 网格列数（列表传 1）
 * 页大小 = 可见行数 × 列数，最少渲染一行
 */
export function computePageSize(itemHeight = 112, reserved = 330, cols = 1): number {
  const vh = typeof window === 'undefined' ? 800 : window.innerHeight
  const rows = Math.max(MIN_ROWS, Math.floor((vh - reserved) / itemHeight))
  return Math.max(cols, Math.min(MAX_PAGE_SIZE, rows * cols))
}
