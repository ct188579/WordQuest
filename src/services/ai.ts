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
  /** 联网检索到的参考资料（buildSearchContext 的产物）。为空则纯靠模型知识写作 */
  searchContext = '',
): Promise<GeneratedArticle> {
  const ln = langName(lang)

  const grounding = searchContext
    ? `

Below is REFERENCE MATERIAL retrieved from a live web search performed just now. It is more recent than your training data:
---
${searchContext}
---
Rules when reference material is provided:
- Treat it as the source of truth for facts, names, numbers, dates and places.
- The article MUST cover what is genuinely current about this topic (recent developments), not just evergreen background.
- Never invent specific figures, dates or quotes that the reference material does not support.
- Weave the facts into a flowing article; do NOT copy the snippets verbatim and do NOT mention "the search results" or "the reference material".`

    : ''

  return chatJSON<{ title?: string; content?: string }, GeneratedArticle>(
    JSON_ONLY,
    `Write a ${ln} article about the topic "${topic}" for a language learner.${grounding}
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
// 7. 外刊精读：仿指定刊物风格生成文章（含逐段翻译 + 核心词汇表）
// ------------------------------------------------------------

export interface GeneratedPressArticle {
  title: string
  paragraphs: string[]
  translations: string[]
  vocabulary: { word: string; pos: string; meaning: string }[]
}

export async function generatePressArticle(
  /** 仿写的刊物名，如 The Economist */
  source: string,
  /** 主题；为空则 AI 自选一个适合该刊物的话题 */
  topic: string | null,
  uiLang: string = getUILanguage(),
): Promise<GeneratedPressArticle> {
  const ul = langName(uiLang)
  const topicLine = topic
    ? `Topic: "${topic}".`
    : `Pick a timely, intellectually engaging topic yourself that fits ${source}.`

  return chatJSON<
    { title?: string; paragraphs?: string[]; translations?: string[]; vocabulary?: unknown },
    GeneratedPressArticle
  >(
    JSON_ONLY,
    `You are a senior editor at ${source}. Write one authentic-style English article for a language learner doing close reading (精读). ${topicLine}
Requirements:
- Voice, register, sentence structure and rhetorical habits must genuinely resemble ${source} (its typical openings, transitions, hedging and wit where appropriate).
- 6-8 paragraphs, each 60-100 words, total 500-700 words. No subheadings, no bullet points.
- Difficulty: challenging but readable — the way ${source} actually reads.
- "translations": a faithful, fluent ${ul} translation of EACH paragraph, same order and same length as "paragraphs".
- "vocabulary": exactly 10 words or phrases from the article that are advanced but worth learning. For each: "word" (lemma or phrase as it appears), "pos" (part of speech, e.g. n. / v. / adj. / phr.), "meaning" (concise gloss in ${ul}). Do NOT include basic words.
Return JSON: {"title": "...", "paragraphs": ["para1", "para2", ...], "translations": ["trans1", "trans2", ...], "vocabulary": [{"word": "...", "pos": "...", "meaning": "..."}, ...]}`,
    (p) => ({
      title: p.title ?? (topic ?? source),
      paragraphs: Array.isArray(p.paragraphs) ? p.paragraphs.filter(Boolean) : [],
      translations: Array.isArray(p.translations) ? p.translations.filter(Boolean) : [],
      vocabulary: Array.isArray(p.vocabulary)
        ? (p.vocabulary as { word?: string; pos?: string; meaning?: string }[])
            .filter((v) => v && typeof v.word === 'string' && v.word.trim())
            .map((v) => ({
              word: v.word!.trim(),
              pos: typeof v.pos === 'string' ? v.pos.trim() : '',
              meaning: typeof v.meaning === 'string' ? v.meaning.trim() : '',
            }))
        : [],
    }),
    (p) =>
      Boolean(p.title) &&
      Array.isArray(p.paragraphs) &&
      p.paragraphs.length >= 3 &&
      Array.isArray(p.translations) &&
      p.translations.length >= 3,
  )
}

// ------------------------------------------------------------
// 7b. 外刊精读（真实外刊）：标注真实文章
//
// 关键约束：AI 只返回「保留哪些段的索引」+ 译文 + 词汇，
// 段落正文始终用抽取到的原文，一个字都不改写 —— 真实外刊必须是原文。
// ------------------------------------------------------------

export interface AnnotatedPress {
  paragraphs: string[]
  translations: string[]
  vocabulary: { word: string; pos: string; meaning: string }[]
}

export async function annotatePressArticle(
  /** 抽取并清洗后的候选段落（来自 splitArticleParagraphs） */
  candidates: string[],
  meta: { title: string; source: string },
  uiLang: string = getUILanguage(),
): Promise<AnnotatedPress> {
  const ul = langName(uiLang)
  const list = candidates.map((p, i) => `[${i}] ${p.slice(0, 1500)}`).join('\n\n')

  return chatJSON<
    { keep?: number[]; translations?: string[]; vocabulary?: unknown },
    AnnotatedPress
  >(
    JSON_ONLY,
    `Below are paragraphs extracted from a real English article, "${meta.title}", published by ${meta.source}.
Some of them are NOT article body — navigation menus, cookie notices, ads, image captions, author bios, related-article teasers, comment sections. The rest are the article body.

Task: identify the body paragraphs and translate them.

Rules:
- "keep": indices (0-based, into the numbered list below) of the paragraphs that belong to the article body, in their original order.
- Drop ONLY non-body junk. Keep EVERY body paragraph — never merge, split, or omit any paragraph of the actual article.
- NEVER rewrite, shorten or paraphrase: you never output the paragraph text itself, only its index.
- "translations": a faithful, fluent ${ul} translation for EACH kept paragraph, in the same order and exactly the same count as "keep".
- "vocabulary": exactly 10 advanced-but-useful words or phrases that genuinely appear in the kept paragraphs. For each: "word" (as it appears in the article), "pos" (part of speech, e.g. n. / v. / adj. / phr.), "meaning" (concise gloss in ${ul}). Do not pick basic words.
Return JSON: {"keep": [0, 2, 3, ...], "translations": ["trans1", "trans2", ...], "vocabulary": [{"word": "...", "pos": "...", "meaning": "..."}, ...]}

Paragraphs:
${list}`,
    (p) => {
      const keep = Array.isArray(p.keep)
        ? (p.keep as unknown[]).filter(
            (n): n is number => typeof n === 'number' && n >= 0 && n < candidates.length,
          )
        : []
      const trans = Array.isArray(p.translations) ? (p.translations as unknown[]) : []
      return {
        paragraphs: keep.map((i) => candidates[i]),
        translations: keep.map((_, k) => (typeof trans[k] === 'string' ? (trans[k] as string) : '')),
        vocabulary: Array.isArray(p.vocabulary)
          ? (p.vocabulary as { word?: string; pos?: string; meaning?: string }[])
              .filter((v) => v && typeof v.word === 'string' && v.word.trim())
              .map((v) => ({
                word: v.word!.trim(),
                pos: typeof v.pos === 'string' ? v.pos.trim() : '',
                meaning: typeof v.meaning === 'string' ? v.meaning.trim() : '',
              }))
          : [],
      }
    },
    (p) =>
      Array.isArray(p.keep) &&
      p.keep.length >= 3 &&
      Array.isArray(p.translations) &&
      p.translations.length >= 3,
  )
}

// ------------------------------------------------------------
// 8. 阅读：根据兴趣方向推荐话题（用户可能还没想好看什么）
// ------------------------------------------------------------

export interface TopicSuggestion {
  /** 话题本身，点击即用于生成文章 */
  topic: string
  /** 一句推荐理由（悬浮提示用） */
  reason: string
}

export async function suggestTopics(
  interests: string,
  /** 文章将使用的语言，话题需要适合用它来写 */
  articleLang: string = 'en',
  uiLang: string = getUILanguage(),
  count = 6,
  /** 已推荐过的话题，避免「换一批」时重复 */
  avoid: string[] = [],
): Promise<TopicSuggestion[]> {
  const al = langName(articleLang)
  const ul = langName(uiLang)
  const interestLine = interests.trim()
    ? `The learner's stated interests are: ${interests.trim()}.`
    : `The learner has not specified interests yet.`
  const avoidLine = avoid.length
    ? `\nDo NOT repeat any of these already-suggested topics: ${avoid.join(' | ')}.`
    : ''

  return chatJSON<
    { topics?: Array<{ topic?: string; reason?: string } | string> },
    TopicSuggestion[]
  >(
    JSON_ONLY,
    `You help a learner of ${al} choose something to read today.
${interestLine}
Suggest ${count} specific, appealing reading topics that this person would actually want to read about, and that work well as a short ${al} article (400-600 words).
Rules:
- Be concrete and interesting — a named subject beats a vague category (e.g. "Why Japan's trains are never late" instead of "transport").
- Vary the angle: mix the learner's interests with adjacent ideas, current trends, science, culture, work and everyday life.
- Each topic must be readable on its own without prior context.
- Write the "topic" and "reason" text in ${ul}.
- The "reason" is one short sentence (max 12 words) explaining why it fits the learner.${avoidLine}
Return JSON: {"topics": [{"topic": "...", "reason": "..."}]}`,
    (p) => {
      const list = Array.isArray(p.topics) ? p.topics : []
      return list
        .map((it) => {
          if (typeof it === 'string') return { topic: it.trim(), reason: '' }
          return { topic: (it?.topic ?? '').trim(), reason: (it?.reason ?? '').trim() }
        })
        .filter((it) => it.topic.length > 0)
        .slice(0, count)
    },
    (p) => Array.isArray(p.topics) && p.topics.length > 0,
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
