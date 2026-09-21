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

// ============================================================
// 外刊精读：真实外刊文章列表 + 正文抽取（Tavily Search / Extract）
//
// 为什么可行：Tavily 的 extract 端点能把网页正文抽成纯文本，
// 且 CORS 放行（回显 Origin、允许 authorization 头），浏览器可直连，
// 无需自建代理。免费刊物（Guardian / BBC / Scientific American / Atlantic）
// 可拿到全文；硬付费墙（Economist）抽不到，NYT 只给开头摘要。
//
// 版权：原文只存浏览器本地，不写进数据库、不写进仓库，并始终展示原文链接。
// ============================================================

export interface PressArticleItem {
  title: string
  url: string
  host: string
  snippet: string
  publishedDate?: string
}

/**
 * 精读用的刊物。query 是实测调过的检索词：
 * 太具体的词容易命中栏目聚合页（如 world news analysis → /tone/analysis），
 * 宽泛的 news 命中真实文章页的比例最高。
 */
export const PRESS_FEEDS: { name: string; domain: string; query: string }[] = [
  { name: 'The Guardian', domain: 'theguardian.com', query: 'news' },
  { name: 'BBC News', domain: 'bbc.com', query: 'news' },
  { name: 'The Atlantic', domain: 'theatlantic.com', query: 'news' },
  { name: 'Scientific American', domain: 'scientificamerican.com', query: 'science research' },
  { name: 'Reuters', domain: 'reuters.com', query: 'news' },
  { name: 'NPR', domain: 'npr.org', query: 'news' },
]

/**
 * 判断链接像不像「一篇具体文章」，而不是栏目页 / 首页 / 视频页。
 * 实测教训：include_domains 搜索常返回 /news/series/xxx 这类聚合页，
 * 抽出来全是文章标题列表，不是正文，必须在这里挡掉。
 */
export function looksLikeArticle(url: string): boolean {
  try {
    const u = new URL(url)
    const segs = u.pathname.split('/').filter(Boolean)
    if (!segs.length) return false
    const last = segs[segs.length - 1]
    const dashes = (last.match(/-/g) ?? []).length

    // 视频 / 图集 / 音频 / 播客 / 直播博客 / 互动页 —— 抽取必失败或不是文章
    if (/\/(video|videos|gallery|galleries|audio|podcast|podcasts|live|interactive)\//i.test(u.pathname)) {
      return false
    }

    // 长 slug（文章标题转写）
    if (last.length >= 22 && dashes >= 3) return true
    // 路径含日期段：/2026/sep/20/... 或 /2026/09/20/...
    if (/\/(19|20)\d{2}\/[a-z]{3,9}\/\d{1,2}\//i.test(u.pathname)) return true
    if (/\/(19|20)\d{2}\/\d{1,2}\/\d{1,2}\//.test(u.pathname)) return true
    // 带文章 id 段
    if (/\/(articles?|story|news\/[a-z-]+-\d{5,})\//i.test(u.pathname)) return true
    if (/\d{5,}/.test(last)) return true
    if (/\.html?$/i.test(last)) return true
    return false
  } catch {
    return false
  }
}

/** 拉取某刊近期真实文章列表（只保留「像文章」的链接） */
export async function fetchPressArticles(
  feed: { domain: string; query: string },
  opts: { freshness?: Freshness; maxResults?: number } = {},
): Promise<PressArticleItem[]> {
  const { tavilyKey, freshness } = useSettings.getState()
  if (!tavilyKey.trim()) throw new SearchError('No search API key configured.', 'no_key')

  const range = opts.freshness ?? freshness
  const maxResults = opts.maxResults ?? 8
  const key = `press-list:v2:${feed.domain}:${range}:${maxResults}`

  return cachedFetch(
    key,
    async () => {
      // 多要一些再筛，因为要丢掉栏目页
      const data = await tavilyPost(
        'search',
        {
          query: feed.query,
          topic: 'general',
          search_depth: 'basic',
          max_results: Math.min(maxResults * 2, 20),
          include_domains: [feed.domain],
          ...(TIME_RANGE[range] ? { time_range: TIME_RANGE[range] } : {}),
        },
        tavilyKey.trim(),
      )
      const raw: unknown[] = Array.isArray(data?.results) ? data.results : []
      return normalize(raw)
        .filter((r) => sourceHost(r.url).endsWith(feed.domain) && looksLikeArticle(r.url))
        .slice(0, maxResults)
        .map((r) => ({
          title: r.title,
          url: r.url,
          host: sourceHost(r.url),
          snippet: r.content.slice(0, 220),
          publishedDate: r.publishedDate,
        }))
    },
    10 * 60_000,
  )
}

/** 抽取单篇文章正文（返回原始 Markdown 文本，交给 splitArticleParagraphs 清洗分段） */
export async function extractArticle(url: string): Promise<string> {
  const { tavilyKey } = useSettings.getState()
  if (!tavilyKey.trim()) throw new SearchError('No search API key configured.', 'no_key')

  const target = url.trim()
  if (!/^https?:\/\//i.test(target)) {
    throw new SearchError('Please paste a full http(s) article URL.', 'network')
  }

  const data = await tavilyPost(
    'extract',
    { urls: [target], extract_depth: 'advanced' },
    tavilyKey.trim(),
    60_000,
  )

  const results: unknown[] = Array.isArray(data?.results) ? data.results : []
  const first = results[0] as Record<string, unknown> | undefined
  const raw = typeof first?.raw_content === 'string' ? first.raw_content : ''
  if (!raw.trim()) {
    throw new SearchError('Could not extract this page (paywall or blocked).', 'network')
  }
  return raw
}

/**
 * 抽取的原文 → 候选段落数组（纯前端清洗，不改写原文一个字）
 * 剔除导航、菜单、订阅提示、图片链接等杂质，只留像正文的段落。
 */
export function splitArticleParagraphs(raw: string): string[] {
  const NOISE = /(cookie|subscribe|subscription|newsletter|sign in|log in|advertisement|advertise|privacy policy|terms of service|all rights reserved|share this|read more|related articles?|most viewed|follow us|下载|copyright ©)/i

  const blocks = raw
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean)

  const cleaned = blocks
    .map((b) => {
      // 段内单换行合成空格，压缩多余空白
      let s = b.replace(/\s*\n\s*/g, ' ').replace(/\s{2,}/g, ' ').trim()
      // 去掉纯图片 / 纯链接行
      s = s.replace(/!\[[^\]]*\]\([^)]*\)/g, '').trim()
      // 去掉行首的 markdown 标题/列表标记
      s = s.replace(/^[#*\->\s]+/, '').trim()
      // 去掉行内加粗/斜体标记（保留文字，正文里不该出现 markdown 语法）
      s = s.replace(/\*\*/g, '').replace(/(^|\s)\*(\S)/g, '$1$2')
      return s
    })
    .filter((s) => {
      if (s.length < 70) return false // 太短：多半是标题行、菜单项、图注
      if (NOISE.test(s)) return false
      // 段首就是 markdown 链接 → 导航 / 推荐位
      if (/^\[[^\]]*\]\([^)]*\)/.test(s)) return false
      // 作者署名行（By David A. Graham / By [Name](author-link)）
      if (/^by\s+(\[|[A-Z])/i.test(s) && s.length < 120) return false
      // 图片署名（Photograph: ... / Illustration by ...）
      if (/^(photograph|illustration|image|photo|credit)s?\s*[:by]/i.test(s) && s.length < 140) return false
      // 链接密度过高 → 导航区
      const links = (s.match(/\[[^\]]*\]\([^)]*\)/g) ?? []).length
      if (links >= 2 && links * 40 > s.length) return false
      // 中文占比极高 → 非英文外刊页（导航/翻译提示）
      const cjk = (s.match(/[\u4e00-\u9fff]/g) ?? []).length
      if (cjk > s.length * 0.3) return false
      return true
    })

  // 限制送往 AI 的体量：正文一般在前部，取前 24 段
  return cleaned.slice(0, 24)
}

/** Tavily 通用 POST：统一超时与错误分类 */
async function tavilyPost(
  path: 'search' | 'extract',
  body: Record<string, unknown>,
  apiKey: string,
  timeoutMs = 25_000,
): Promise<Record<string, unknown> | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  let res: Response
  try {
    res = await fetch(`https://api.tavily.com/${path}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify(body),
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new SearchError('Request timed out.', 'network')
    }
    throw new SearchError('Request failed. Check your connection.', 'network')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    if (res.status === 401 || res.status === 403) {
      throw new SearchError('Invalid search API key (401). Check Settings.', 'unauthorized', res.status)
    }
    if (res.status === 429 || res.status === 432) {
      throw new SearchError('Quota exceeded (429). Try again later.', 'rate_limited', res.status)
    }
    const text = await res.text().catch(() => '')
    throw new SearchError(`Request failed (${res.status}): ${text.slice(0, 160)}`, 'network', res.status)
  }

  return res.json().catch(() => null)
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
