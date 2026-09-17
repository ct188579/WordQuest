import { useSettings, type Freshness } from '../stores/settings'
import { cachedFetch } from './cache'

// ============================================================
// 联网检索服务（Tavily Search API）
//
// 为什么需要它：大模型的知识有截止日期，问「最近发生了什么」它答不出来。
// 生成文章前先检索一次，把结果作为「事实依据」塞进 prompt，
// 文章就能写到最新的进展。
//
// 安全：Key 只从 localStorage 读取（设置页填写），不写进代码、不写进 .env，
// 避免开源仓库和前端产物里泄露密钥。
// ============================================================

export interface SearchResult {
  title: string
  url: string
  content: string
  publishedDate?: string
}

export class SearchError extends Error {
  readonly status?: number
  readonly code?: 'no_key' | 'unauthorized' | 'rate_limited' | 'network'

  constructor(message: string, code?: SearchError['code'], status?: number) {
    super(message)
    this.name = 'SearchError'
    this.code = code
    this.status = status
  }
}

const TAVILY_ENDPOINT = 'https://api.tavily.com/search'

/** 时效 → Tavily time_range（any 表示不限制） */
const TIME_RANGE: Record<Freshness, string | undefined> = {
  week: 'week',
  month: 'month',
  year: 'year',
  any: undefined,
}

/**
 * 检索网页资料。命中 10 分钟内存缓存，同一话题反复生成文章不会重复消耗额度。
 * 失败时抛 SearchError，调用方决定是否降级为「不联网」继续生成。
 */
export async function searchWeb(
  query: string,
  opts: { freshness?: Freshness; maxResults?: number } = {},
): Promise<SearchResult[]> {
  const q = query.trim()
  if (!q) return []

  const { tavilyKey, freshness } = useSettings.getState()
  const range = opts.freshness ?? freshness
  const maxResults = opts.maxResults ?? 5

  if (!tavilyKey.trim()) {
    throw new SearchError('No search API key configured.', 'no_key')
  }

  return cachedFetch(`search:v1:${range}:${maxResults}:${q.toLowerCase()}`, () => runTavily(q, tavilyKey.trim(), range, maxResults), 10 * 60_000)
}

async function runTavily(
  query: string,
  apiKey: string,
  freshness: Freshness,
  maxResults: number,
): Promise<SearchResult[]> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 25_000)

  let res: Response
  try {
    res = await fetch(TAVILY_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        query,
        topic: 'general',
        search_depth: 'basic',
        max_results: maxResults,
        ...(TIME_RANGE[freshness] ? { time_range: TIME_RANGE[freshness] } : {}),
      }),
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new SearchError('Search timed out.', 'network')
    }
    // 浏览器直连被拦（CORS / 断网）
    throw new SearchError('Search request failed. Check your connection.', 'network')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new SearchError('Invalid search API key (401). Check Settings.', 'unauthorized', res.status)
    }
    if (res.status === 429 || res.status === 432) {
      throw new SearchError('Search quota exceeded (429). Try again later.', 'rate_limited', res.status)
    }
    const body = await res.text().catch(() => '')
    throw new SearchError(`Search failed (${res.status}): ${body.slice(0, 160)}`, 'network', res.status)
  }

  const data = await res.json().catch(() => null)
  const raw: unknown[] = Array.isArray(data?.results) ? data.results : []

  return normalize(raw).slice(0, maxResults)
}

/** 结果归一化：去空、按 URL 去重、裁剪过长的正文 */
function normalize(raw: unknown[]): SearchResult[] {
  const seen = new Set<string>()
  const out: SearchResult[] = []

  for (const item of raw) {
    const r = item as Record<string, unknown>
    const url = typeof r?.url === 'string' ? r.url : ''
    const title = typeof r?.title === 'string' ? r.title.trim() : ''
    const content = typeof r?.content === 'string' ? r.content.trim() : ''
    if (!url || seen.has(url)) continue
    seen.add(url)
    out.push({
      title: title || url,
      url,
      content: content.slice(0, 1200),
      publishedDate: typeof r?.published_date === 'string' ? r.published_date : undefined,
    })
  }
  return out
}

/** URL → 域名（展示来源用） */
export function sourceHost(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '')
  } catch {
    return url
  }
}

/** 把检索结果拼成给模型看的「参考资料」文本 */
export function buildSearchContext(results: SearchResult[]): string {
  return results
    .map((r, i) => {
      const date = r.publishedDate ? ` (${r.publishedDate})` : ''
      return `[${i + 1}] ${r.title}${date}\n${r.url}\n${r.content}`
    })
    .join('\n\n')
}
