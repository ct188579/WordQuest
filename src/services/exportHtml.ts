import dayjs from 'dayjs'
import { fetchBooks } from './books'
import { fetchWords } from './words'
import { STAGE_INTERVALS } from './study'
import type { Book, Word } from '../types'

// ============================================================
// 单词导出：生成一个自包含的美观 HTML 文件（内联样式 + 原生 JS 搜索）
// 双击即可离线打开，也能直接打印成 PDF
// ============================================================

/** HTML 转义，防止单词内容里的特殊字符破坏页面结构 */
function esc(s: string | null | undefined): string {
  return (s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

function masteryInfo(level: number): { label: string; cls: string } {
  if (level >= 5) return { label: '已掌握', cls: 'm-mastered' }
  if (level >= 1) return { label: '学习中', cls: 'm-learning' }
  return { label: '未学', cls: 'm-new' }
}

function buildWordCard(w: Word, lang: string): string {
  const m = masteryInfo(w.mastery_level)
  const examples = (w.example_sentences ?? [])
    .map(
      (ex) => `<div class="ex"><p class="ex-en">${esc(ex.en)}</p><p class="ex-cn">${esc(ex.cn)}</p></div>`,
    )
    .join('')
  const tags = (w.tags ?? []).map((t) => `<span class="tag">#${esc(t)}</span>`).join('')
  const nextReview = dayjs(w.next_review_at).format('YYYY-MM-DD')

  return `
  <article class="card" data-search="${esc(
    [w.word, w.meaning_cn, w.meaning_en, w.phonetic, ...(w.tags ?? [])].filter(Boolean).join(' '),
  )}">
    <div class="card-head">
      <div class="card-title">
        <h2>${esc(w.word)}</h2>
        <button class="speak" data-word="${esc(w.word)}" data-lang="${esc(lang)}" title="朗读">🔊</button>
        ${w.phonetic ? `<span class="phonetic">${esc(w.phonetic)}</span>` : ''}
        ${w.part_of_speech ? `<span class="pos">${esc(w.part_of_speech)}</span>` : ''}
      </div>
      <span class="badge ${m.cls}">${m.label}</span>
    </div>
    ${w.meaning_cn ? `<p class="cn">${esc(w.meaning_cn)}</p>` : ''}
    ${w.meaning_en ? `<p class="en">${esc(w.meaning_en)}</p>` : ''}
    ${examples ? `<div class="examples">${examples}</div>` : ''}
    ${w.root_affix ? `<p class="meta"><b>词根词缀</b>${esc(w.root_affix)}</p>` : ''}
    ${w.notes ? `<p class="meta"><b>笔记</b>${esc(w.notes)}</p>` : ''}
    <div class="card-foot">
      <span class="lv">Lv.${w.mastery_level}</span>
      <span>练习 ${w.review_count} 次 · 正确 ${w.correct_count} 次</span>
      <span>下次复习 ${nextReview}</span>
      ${tags ? `<span class="tags">${tags}</span>` : ''}
    </div>
  </article>`
}

function buildHtml(words: Word[], books: Book[]): string {
  const mastered = words.filter((w) => w.mastery_level >= 5).length
  const learning = words.filter((w) => w.mastery_level >= 1 && w.mastery_level < 5).length
  const fresh = words.length - mastered - learning

  // 按单词本分组（无本的归「未分组」，按字母排序方便当词典查）
  const bookName = new Map(books.map((b) => [b.id, b]))
  const groups = new Map<string, { name: string; lang: string; words: Word[] }>()
  for (const w of words) {
    const key = w.book_id ?? 'none'
    if (!groups.has(key)) {
      groups.set(key, {
        name: w.book_id ? (bookName.get(w.book_id)?.name ?? '未知单词本') : '未分组',
        lang: w.book_id ? (bookName.get(w.book_id)?.language ?? 'en') : 'en',
        words: [],
      })
    }
    groups.get(key)!.words.push(w)
  }
  for (const g of groups.values()) g.words.sort((a, b) => a.word.localeCompare(b.word))

  const sections = [...groups.values()]
    .map((g) => `
    <section>
      <h1 class="group-title">${esc(g.name)} <span class="group-count">${g.words.length} 词</span></h1>
      <div class="grid">${g.words.map((w) => buildWordCard(w, g.lang)).join('')}</div>
    </section>`)
    .join('')

  const stageRows = STAGE_INTERVALS.map((_, lv) => {
    const n = words.filter((w) => w.mastery_level === lv).length
    return n > 0 ? `<span class="lv-chip">Lv.${lv} × ${n}</span>` : ''
  }).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>WordQuest 词库 · ${words.length} 词 · ${dayjs().format('YYYY-MM-DD')}</title>
<style>
  :root {
    --duo: #58cc02; --duo-dark: #4caf00; --duo-blue: #1cb0f6; --duo-yellow: #ffc800;
    --duo-red: #ff4b4b; --ink: #3c3c3c; --ink-soft: #777; --paper: #f7f7f5;
  }
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "PingFang SC", "Segoe UI", "Microsoft YaHei", sans-serif;
    background: var(--paper); color: var(--ink); padding-bottom: 60px;
  }
  header {
    background: linear-gradient(135deg, var(--duo), var(--duo-blue));
    color: #fff; padding: 40px 20px 32px; text-align: center;
  }
  header h1 { font-size: 28px; font-weight: 900; letter-spacing: 1px; }
  header p { margin-top: 6px; opacity: .85; font-size: 14px; font-weight: 600; }
  .stats { display: flex; justify-content: center; gap: 12px; margin-top: 20px; flex-wrap: wrap; }
  .stat { background: rgba(255,255,255,.18); backdrop-filter: blur(6px); border-radius: 14px; padding: 10px 22px; }
  .stat b { display: block; font-size: 24px; font-weight: 900; }
  .stat span { font-size: 12px; font-weight: 700; opacity: .85; }
  .toolbar {
    position: sticky; top: 0; z-index: 10; background: rgba(247,247,245,.92);
    backdrop-filter: blur(8px); padding: 14px 20px; border-bottom: 1px solid #e8e8e4;
    display: flex; gap: 10px; align-items: center; flex-wrap: wrap; justify-content: center;
  }
  .toolbar input {
    width: min(420px, 90vw); padding: 10px 16px; border: 2px solid #e0e0dc; border-radius: 999px;
    font-size: 15px; font-weight: 600; outline: none; background: #fff; color: var(--ink);
  }
  .toolbar input:focus { border-color: var(--duo); }
  .lv-chip {
    font-size: 12px; font-weight: 800; color: var(--ink-soft);
    background: #fff; border: 1px solid #e8e8e4; border-radius: 999px; padding: 4px 10px;
  }
  main { max-width: 1080px; margin: 0 auto; padding: 24px 16px; }
  .group-title { font-size: 20px; font-weight: 900; margin: 28px 0 14px; display: flex; align-items: baseline; gap: 10px; }
  .group-count { font-size: 13px; font-weight: 700; color: var(--ink-soft); }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 14px; }
  .card {
    background: #fff; border: 2px solid #e8e8e4; border-radius: 16px; padding: 16px 18px;
    display: flex; flex-direction: column; gap: 8px; transition: box-shadow .2s, transform .2s;
  }
  .card:hover { box-shadow: 0 6px 20px rgba(0,0,0,.07); transform: translateY(-2px); }
  .card.hide { display: none; }
  .card-head { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; }
  .card-title { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
  .card-title h2 { font-size: 20px; font-weight: 900; }
  .speak { border: none; background: none; cursor: pointer; font-size: 15px; padding: 2px; }
  .phonetic { color: var(--ink-soft); font-size: 13px; font-weight: 700; }
  .pos {
    font-size: 11px; font-weight: 800; color: var(--duo-blue);
    background: var(--duo-blue)/10; background: rgba(28,176,246,.12);
    border-radius: 6px; padding: 2px 7px;
  }
  .badge { font-size: 11px; font-weight: 900; border-radius: 999px; padding: 4px 10px; white-space: nowrap; }
  .m-mastered { color: var(--duo-dark); background: rgba(88,204,2,.14); }
  .m-learning { color: #1899d6; background: rgba(28,176,246,.14); }
  .m-new { color: #9aa0a6; background: #f0f0ec; }
  .cn { font-size: 16px; font-weight: 800; }
  .en { font-size: 13px; font-weight: 600; color: var(--ink-soft); }
  .examples { display: flex; flex-direction: column; gap: 6px; }
  .ex { background: var(--paper); border-radius: 10px; padding: 8px 10px; }
  .ex-en { font-size: 13px; font-weight: 700; }
  .ex-cn { font-size: 12px; color: var(--ink-soft); margin-top: 2px; }
  .meta { font-size: 12.5px; color: var(--ink-soft); line-height: 1.5; }
  .meta b { color: var(--ink); margin-right: 6px; }
  .card-foot {
    display: flex; flex-wrap: wrap; gap: 6px 14px; font-size: 11.5px; font-weight: 700;
    color: var(--ink-soft); border-top: 1px dashed #ececea; padding-top: 8px; margin-top: auto;
  }
  .lv { color: var(--duo-dark); font-weight: 900; }
  .tag { font-size: 11px; font-weight: 700; color: #b45309; background: rgba(255,200,0,.16); border-radius: 6px; padding: 2px 7px; }
  .empty-tip { text-align: center; color: var(--ink-soft); font-weight: 700; padding: 30px 0; display: none; }
  @media print {
    .toolbar { display: none; }
    .card { break-inside: avoid; border-color: #ddd; }
    header { background: var(--duo) !important; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
    body { background: #fff; }
  }
</style>
</head>
<body>
<header>
  <h1>🦉 WordQuest 词库</h1>
  <p>导出于 ${dayjs().format('YYYY年M月D日 HH:mm')} · 共 ${words.length} 个单词</p>
  <div class="stats">
    <div class="stat"><b>${words.length}</b><span>总词数</span></div>
    <div class="stat"><b>${mastered}</b><span>已掌握</span></div>
    <div class="stat"><b>${learning}</b><span>学习中</span></div>
    <div class="stat"><b>${fresh}</b><span>未学</span></div>
  </div>
</header>

<div class="toolbar">
  <input id="q" type="search" placeholder="搜索单词 / 释义 / 标签…" autocomplete="off">
  ${stageRows}
</div>

<main>
  ${sections || '<p class="empty-tip">词库还是空的</p>'}
  <p class="empty-tip" id="noResult">没有匹配的单词</p>
</main>

<script>
  var input = document.getElementById('q');
  var cards = document.querySelectorAll('.card');
  var noResult = document.getElementById('noResult');
  input.addEventListener('input', function () {
    var q = input.value.trim().toLowerCase();
    var visible = 0;
    cards.forEach(function (c) {
      var hit = !q || (c.getAttribute('data-search') || '').toLowerCase().indexOf(q) !== -1;
      c.classList.toggle('hide', !hit);
      if (hit) visible++;
    });
    noResult.style.display = visible ? 'none' : 'block';
  });
  document.addEventListener('click', function (e) {
    var btn = e.target.closest('.speak');
    if (!btn) return;
    var u = new SpeechSynthesisUtterance(btn.getAttribute('data-word'));
    u.lang = { en: 'en-US', zh: 'zh-CN', ko: 'ko-KR', ja: 'ja-JP' }[btn.getAttribute('data-lang')] || 'en-US';
    speechSynthesis.speak(u);
  });
</script>
</body>
</html>`
}

/** 导出全部单词为美观的 HTML 文件并触发下载 */
export async function exportWordsHtml(): Promise<void> {
  const [words, books] = await Promise.all([fetchWords(), fetchBooks()])
  const html = buildHtml(words, books as Book[])

  const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `wordquest-${dayjs().format('YYYYMMDD-HHmm')}.html`
  a.click()
  URL.revokeObjectURL(url)
}
