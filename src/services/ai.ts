import { useSettings } from '../stores/settings'
import { AI_LANG_NAMES, getUILanguage } from '../i18n'
import type { AIWordCompletion, ExampleSentence } from '../types'

// ============================================================
// 统一 AI 服务层（OpenAI 兼容 Chat Completions 接口）
// 以后切换模型 / 供应商只需要改 Settings 页的 baseUrl + model
//
// 多语言说明：
//   wordLang — 单词本的语言（要学的目标语言），如 en / ko / ja
//   uiLang   — 界面语言（释义、例句翻译用什么语言），默认取当前 UI 语言
// 字段含义（沿用了旧列名）：
//   meaning_cn → 界面语言的释义；meaning_en → 目标语言的单词语释义
//   example 的 en → 目标语言例句；cn → 界面语言翻译
// ============================================================

class AIError extends Error {
  readonly status?: number

  constructor(message: string, status?: number) {
    super(message)
    this.name = 'AIError'
    this.status = status
  }
}

const langName = (code: string) => AI_LANG_NAMES[code] ?? 'English'

/**
 * 从模型输出中提取「第一个完整闭合的 JSON 值」。
 * 很多小模型（如 GLM-4-9B）会在 JSON 后面追加额外文字，或只把一部分包进 JSON；
 * 这个实现会跳过字符串转义、跟踪括号深度，取第一个能解析成功的完整 JSON 值。
 */
function extractJSON<T>(text: string): T {
  const cleaned = text.replace(/```(?:json)?/gi, '').trim()
  const start = cleaned.search(/[[{]/)
  if (start === -1) throw new AIError('AI returned non-JSON content. Try again.')

  const chunk = cleaned.slice(start)
  const open = chunk[0] === '{' ? '{' : '['
  const close = chunk[0] === '{' ? '}' : ']'

  let depth = 0
  let inString = false
  let escaped = false
  for (let i = 0; i < chunk.length; i++) {
    const c = chunk[i]
    if (inString) {
      if (escaped) escaped = false
      else if (c === '\\') escaped = true
      else if (c === '"') inString = false
      continue
    }
    if (c === '"') inString = true
    else if (c === open) depth++
    else if (c === close) {
      depth--
      if (depth === 0) {
        try {
          return JSON.parse(chunk.slice(0, i + 1)) as T
        } catch {
          break // 这一段不完整，走兜底
        }
      }
    }
  }

  // 兜底：截取到最后一个闭合括号再试一次
  const lastEnd = Math.max(chunk.lastIndexOf('}'), chunk.lastIndexOf(']'))
  if (lastEnd > 0) {
    try {
      return JSON.parse(chunk.slice(0, lastEnd + 1)) as T
    } catch {
      /* 继续抛错 */
    }
  }
  throw new AIError('Failed to parse AI response. Try again.')
}

/** 底层请求：带超时、错误归一化 */
async function chat(systemPrompt: string, userPrompt: string): Promise<string> {
  const { apiKey, baseUrl, model } = useSettings.getState()
  if (!apiKey) {
    throw new AIError('No API key configured. Go to Settings to add one.')
  }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 60_000)

  let res: Response
  try {
    res = await fetch(`${baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.4,
      }),
      signal: controller.signal,
    })
  } catch (e) {
    if (e instanceof DOMException && e.name === 'AbortError') {
      throw new AIError('Request timed out. Check your network or base URL.')
    }
    throw new AIError('Network error. Check your base URL and connection.')
  } finally {
    clearTimeout(timer)
  }

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    if (res.status === 401) throw new AIError('Invalid API key (401). Check Settings.', 401)
    throw new AIError(`AI request failed (${res.status}): ${body.slice(0, 200)}`, res.status)
  }

  const data = await res.json()
  const content: string | undefined = data?.choices?.[0]?.message?.content
  if (!content) throw new AIError('Empty response from AI.')
  return content
}

/**
 * 请求 JSON 并解析；解析失败或未通过 validate 校验时自动重试一次，
 * 并追加一条「必须返回纯 JSON」的强约束（小模型经常在 JSON 外写废话 / 结构偷懒）。
 * 第二次返回不再校验，尽量给用户可用内容。
 */
async function chatJSON<T, R = T>(
  systemPrompt: string,
  userPrompt: string,
  map: (obj: T) => R,
  validate?: (obj: T) => boolean,
): Promise<R> {
  const retryPrompt = `\n\nIMPORTANT: Your previous answer was not valid or incomplete JSON. Reply with ONLY a single valid JSON value matching the requested structure and nothing else — no markdown fences, no explanation, no text before or after the JSON.`

  try {
    const first = extractJSON<T>(await chat(systemPrompt, userPrompt))
    if (validate && !validate(first)) throw new AIError('AI response missing required structure.')
    return map(first)
  } catch {
    const second = extractJSON<T>(await chat(systemPrompt, userPrompt + retryPrompt))
    return map(second)
  }
}

const JSON_ONLY =
  'You are a helpful vocabulary tutor. Always respond with exactly one valid JSON value (object or array) only — no markdown code fences, no commentary, no text before or after the JSON.'

// ------------------------------------------------------------
// 1. 核心：输入单词 → 自动补全全部信息
// ------------------------------------------------------------
export async function completeWord(
  word: string,
  wordLang = 'en',
  uiLang: string = getUILanguage(),
): Promise<AIWordCompletion> {
  const wl = langName(wordLang)
  const ul = langName(uiLang)
  return chatJSON<AIWordCompletion>(
    JSON_ONLY,
    `For the ${wl} word "${word}", return a JSON object with exactly these keys:
{
  "phonetic": "pronunciation transcription (IPA for English; romanization for Japanese/Korean; pinyin for Chinese), e.g. /ˈæpəl/",
  "meaning_cn": "concise definitions in ${ul}, separated by ；",
  "meaning_en": "concise monolingual definition written in ${wl}",
  "part_of_speech": "e.g. n. / v. / adj.",
  "examples": [{"en": "example sentence in ${wl}", "cn": "translation in ${ul}"}],
  "root_affix": "brief word-structure / etymology / word-formation breakdown written in ${ul}, one or two sentences"
}
Provide 2-3 natural, useful example sentences. If the input is a phrase or has multiple common senses, cover the most common one.`,
    (parsed) => {
      if (!Array.isArray(parsed.examples)) parsed.examples = []
      return parsed
    },
  )
}

// ------------------------------------------------------------
// 2. AI 增强：更多例句
// ------------------------------------------------------------
export async function generateExamples(
  word: string,
  wordLang = 'en',
  uiLang: string = getUILanguage(),
): Promise<ExampleSentence[]> {
  const wl = langName(wordLang)
  const ul = langName(uiLang)
  return chatJSON<ExampleSentence[]>(
    JSON_ONLY,
    `Return a JSON array of 3 NEW high-quality example sentences for the ${wl} word "${word}", different from the most common ones. Format: [{"en": "sentence in ${wl}", "cn": "translation in ${ul}"}]. Vary the sentence patterns and contexts.`,
    (arr) => (Array.isArray(arr) ? arr : []),
    (arr) => Array.isArray(arr) && arr.length > 0,
  )
}

// ------------------------------------------------------------
// 3. AI 增强：构词 / 词根词缀拆解
// ------------------------------------------------------------
export async function analyzeRoots(
  word: string,
  wordLang = 'en',
  uiLang: string = getUILanguage(),
): Promise<string> {
  const wl = langName(wordLang)
  const ul = langName(uiLang)
  return chatJSON<{ analysis: string }, string>(
    JSON_ONLY,
    `Break down the ${wl} word "${word}" into roots/prefixes/suffixes (for Korean/Japanese, explain morphemes and word formation instead). Return JSON: {"analysis": "..."}. Write the analysis in ${ul}, structured like: 前缀 xx- 表示...；词根 xx 表示...；后缀 -xx 表示...。再给一个帮助记忆的联想。`,
    (parsed: { analysis: string }) => parsed.analysis,
  )
}

// ------------------------------------------------------------
// 4. AI 增强：易混淆词对比
// ------------------------------------------------------------
export async function compareConfusables(
  word: string,
  wordLang = 'en',
  uiLang: string = getUILanguage(),
): Promise<string> {
  const wl = langName(wordLang)
  const ul = langName(uiLang)
  return chatJSON<
    { comparison?: string | Array<{ word?: string; pos?: string; difference?: string; example?: string }> },
    string
  >(
    JSON_ONLY,
    `List 2-4 ${wl} words commonly confused with "${word}". Return JSON: {"comparison": [{"word": "...", "pos": "词性", "difference": "核心区别（用${ul}写）", "example": "对比例句"}]}.`,
    (parsed: {
      comparison?: string | Array<{ word?: string; pos?: string; difference?: string; example?: string }>
    }) => {
      const items = parsed.comparison
      // 第二次重试后仍是字符串：直接当文字用（总比报错好）
      if (typeof items === 'string') return items
      if (!Array.isArray(items)) return ''
      return items
        .map((it, i) => {
          const head = it.word ? `${i + 1}. ${it.word}${it.pos ? ` (${it.pos})` : ''}` : `${i + 1}.`
          return `${head}\n   区别：${it.difference ?? ''}\n   例句：${it.example ?? ''}`
        })
        .join('\n\n')
    },
    // 校验：模型必须返回数组形式，字符串偷懒会触发一次严格重试
    (parsed) => Array.isArray(parsed.comparison) && (parsed.comparison as unknown[]).length > 0,
  )
}

// ------------------------------------------------------------
// 5. AI 增强：用学过的单词生成短文
// ------------------------------------------------------------
export async function generateStory(
  targetWord: string,
  knownWords: string[],
  wordLang = 'en',
  uiLang: string = getUILanguage(),
): Promise<string> {
  const wl = langName(wordLang)
  const ul = langName(uiLang)
  const pool = knownWords.slice(0, 30).join(', ')
  return chatJSON<{ story: string; translation?: string }, string>(
    JSON_ONLY,
    `Write a short story (80-120 words) in simple ${wl} that MUST include the target word "${targetWord}"${pool ? ` and naturally reuses some of these previously learned words: ${pool}` : ''}.
Return JSON: {"story": "the story in ${wl}", "translation": "translation in ${ul}"}. Bold the target word with **word** in the story.`,
    (parsed: { story: string; translation?: string }) =>
      parsed.translation ? `${parsed.story}\n\n【译文】${parsed.translation}` : parsed.story,
  )
}

// ------------------------------------------------------------
// 6. 阅读：根据主题生成一篇文章
// ------------------------------------------------------------
export interface GeneratedArticle {
  title: string
  content: string
}

export async function generateArticle(
  topic: string,
  lang: string = getUILanguage(),
): Promise<GeneratedArticle> {
  const ln = langName(lang)
  return chatJSON<{ title?: string; content?: string }, GeneratedArticle>(
    JSON_ONLY,
    `Write a ${ln} article about the topic "${topic}" for a language learner.
Requirements:
- Title: concise and catchy.
- Content: 6-9 short paragraphs separated by blank lines (escape them as \\n\\n inside the JSON string).
- Use natural, moderately simple ${ln} so a learner can follow along.
- Keep the total length around 400-600 words.
Return JSON: {"title": "...", "content": "paragraph1\\n\\nparagraph2\\n\\n..."}`,
    (p) => ({ title: p.title ?? topic, content: p.content ?? '' }),
    (p) => Boolean(p.title && p.content),
  )
}

// ------------------------------------------------------------
// 7. 翻译：检测原文语言并翻译成界面语言（用于收藏本自动翻译）
// ------------------------------------------------------------
export async function translateText(
  text: string,
  uiLang: string = getUILanguage(),
): Promise<string> {
  const ul = langName(uiLang)
  return chatJSON<{ translation?: string }, string>(
    JSON_ONLY,
    `Detect the language of the text below, then translate it into ${ul}.
Text: "${text}"
Return JSON: {"translation": "only the translation, no explanation or quotation marks"}.`,
    (p) => p.translation ?? '',
    (p) => Boolean(p.translation),
  )
}

export { AIError }
