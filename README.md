<div align="center">

# 🦉 WordQuest

**个人英语单词学习网站 · Duolingo 风格 · AI 驱动**

输入一个单词，AI 自动补全音标、释义、例句、词根词缀；基于艾宾浩斯遗忘曲线的科学复习；还能让 AI 按主题写文章，选中生词一键收入词库。

</div>
🌐 官方网站：https://word-quest-website.ctstudio.cloud

---

## ✨ 功能特性

| 模块 | 说明 |
| --- | --- |
| 📝 **极简添加单词** | 只需输入单词，AI 自动补全：音标、中文/英文释义、词性、2-3 个例句、词根词缀解释；任何字段都支持手动编辑 |
| 🧠 **艾宾浩斯复习** | 8 级间隔阶梯（10 分钟 → 1 天 → 2 天 → 4 天 → 7 天 → 15 天 → 30 天 → 60 天），Anki 简化版调度；认识/模糊/不认识三档反馈动态调整间隔 |
| 📚 **多语言单词本** | 可创建英语、中文、韩语、日语等任意语言的单词本，单词分本管理，AI 按目标语言生成内容，喇叭按对应语言发音 |
| 📖 **阅读模式** | AI 阅读 Tab：想不出话题时 AI 按你的兴趣推荐一批；生成前可联网检索最新资料，写到的就是最近发生的事；选中文中生词弹出查询窗，一键跳转添加页自动填充；支持整篇朗读 + 段落高亮 + 播放/暂停/停止 |
| 📰 **外刊精读** | 阅读页第二个 Tab，两种内容来源：**真实外刊**（选刊物 The Guardian / BBC / The Atlantic / Scientific American / Reuters / NPR 拉取近期文章，或粘贴任意外刊链接，抓取真实原文；AI 只做生词标注与译文，**原文一字不改**）与 **AI 仿写**（选刊物 + 主题，AI 按该刊风格仿写，遇到付费墙时兜底）。核心词汇文中高亮、点词弹释义可一键收入词库、逐段展开中文译文 + 单段朗读、文末核心词汇表 |
| ⭐ **收藏本** | 短语 / 句子分类收藏，随时保存阅读中遇到的表达；单词详情页例句可一键收藏，支持翻译与备注 |
| 🎵 **英文歌学习** | 上传 mp3 + lrc 歌词：Apple Music 风格当前行高亮与自动滚动、点击行跳转、0.5x-1.5x 变速、单句循环、查词模式点单词直接收入词库 |
| ⚡ **AI 增强** | 更多例句 / 词根词缀拆解 / 易混词对比 / 用学过的词生成短文，一键保存到笔记 |
| 💾 **数据备份** | 全量 JSON 导出 / 导入（单词本、单词、复习历史），导入自动去重并保留复习进度 |
| 🌍 **国际化** | 界面支持中文 / English / 한국어 / 日本語，设置页一键切换 |
| 🎮 **Duolingo 风格 UI** | 浅绿主色 `#58CC02`、Nunito 圆体、3D 按压按钮；GSAP 驱动的卡片翻转、进度条增长、庆祝粒子、页面过渡；移动端底部导航 + 桌面端侧边栏，响应式适配 |
| 🔒 **个人专属** | 登录白名单（前端 `VITE_ALLOWED_EMAILS` + 数据库 `allowed_users` 双层限制），仅指定 Google 账号可用 |

## 🛠 技术栈

- **前端**：Vite · React 19 · TypeScript · Tailwind CSS v4
- **组件**：shadcn/ui 风格（基于 Radix UI）+ lucide-react 图标
- **动画**：GSAP（卡片翻转、进度条、按钮反馈、庆祝微动画）
- **后端 / 数据库 / 认证**：Supabase（Google OAuth + PostgreSQL + RLS 行级安全）
- **状态管理**：Zustand（含 localStorage 持久化：AI 配置、界面语言、阅读文章）
- **其它**：React Router · dayjs · OpenAI 兼容 AI 接口（可在设置页切换任意供应商）

## 🚀 快速开始

### 1. 克隆并安装依赖

```bash
git clone https://github.com/ct188579/WordQuest.git
cd WordQuest-main
pnpm install   # 或 npm install
```

### 2. 配置 Supabase

1. 在 [supabase.com](https://supabase.com) 新建一个项目
2. 打开 **SQL Editor**，执行 [`supabase/schema.sql`](supabase/schema.sql)（幂等，可重复执行）
   - ⚠️ 把文件里 `insert into public.allowed_users (email) values ('you@gmail.com')` 改成你自己的邮箱，否则数据库层会拒绝所有请求
3. **Authentication → Providers → Google**：开启 Google 登录，填入 OAuth Client ID / Secret（在 [Google Cloud Console](https://console.cloud.google.com/apis/credentials) 创建，授权回调 URI 填 `https://<你的项目>.supabase.co/auth/v1/callback`）
4. **Authentication → URL Configuration**：Site URL 填 `http://localhost:5173`，并把该地址加入 Redirect URLs 白名单

### 3. 配置环境变量

复制 `.env.example` 为 `.env` 并填写：

```bash
VITE_SUPABASE_URL=你的 Supabase 项目 URL
VITE_SUPABASE_PUBLISHABLE_KEY=你的 publishable key（旧 anon key 也兼容）
VITE_ALLOWED_EMAILS=你的 Google 邮箱   # 登录白名单，多个用英文逗号分隔
```

### 4. 启动

```bash
pnpm dev
```

打开 http://localhost:5173 ，用 Google 账号登录。

### 5. 配置 AI

进入 **Settings** 页，填入：

- **API Key**：任意 OpenAI 兼容服务的密钥（OpenAI / DeepSeek / Moonshot / OpenRouter / 本地 Ollama 均可）
- **Base URL**：如 `https://api.openai.com/v1`
- **Model**：如 `gpt-4o-mini`

## 📖 使用指南

1. **添加单词**：Add → 输入单词 → 点 Go → AI 自动补全 → 确认保存（可先选择要存入的单词本）
2. **复习**：首页「Start review」→ 点卡片翻转看释义 → 按 认识 / 模糊 / 不认识 反馈；忘记的词本轮会再次出现
3. **阅读（AI 阅读 Tab）**：首页渐变大横幅进入 → 从 AI 推荐的话题里挑一个（点「换一批」换推荐）或自己输入主题 → 生成文章 → 选中生词一键收入词库；可整篇朗读跟读
4. **外刊精读（第二个 Tab）**：真实外刊 → 选刊物点「拉取最新文章」→ 点一篇精读（或粘贴任意文章链接）；也可切到「AI 仿写」按刊物风格生成。读的时候**划词即查**：选中任意单词 → 浮条上一个是「查这个词」（AI 自动补全并收入词库），一个是「词库搜索」（看是否已收藏）
5. **收藏本**：侧边栏进入 → 按 短语 / 句子 分类，点击 + 手动添加；单词详情页例句点 ⭐ 一键收藏到句子
6. **英文歌**：侧边栏进入 → 上传 mp3 + lrc → 播放时当前行高亮自动滚动，支持变速、单句循环、点单词查词
7. **单词本**：词库页顶部管理，创建不同语言（中/英/韩/日）的单词本
8. **设置**：界面语言、AI 配置、阅读兴趣方向、联网搜索、数据导出/导入、账号

### 🌐 阅读「联网搜最新」

模型知识有截止日期，问「最近发生了什么」它答不出来。填一个搜索 API Key 后，生成文章前会先检索最新资料，把结果作为事实依据喂给模型，文章里就是最近发生的事：

1. 去 [tavily.com](https://tavily.com) 注册（免费额度 1000 次/月），拿到 `tvly-…` 开头的 Key
2. 设置页 → **联网搜索** → 填入 Key（**只存在本机浏览器 localStorage，不会进代码或仓库**）
3. 阅读页打开「联网搜最新」开关，可选资料时效（近一周 / 近一月 / 近一年 / 不限）
4. 文章底部会列出**参考来源**链接，方便核对

检索失败会自动降级为「不联网」继续写作，不阻塞生成。另可在设置页填 **兴趣方向**，让 AI 推荐的话题更合口味。

### 📰 外刊精读：读真实外刊

阅读页第二个 Tab 提供两种内容来源，用的是同一个搜索 Key：

**真实外刊**（推荐）
1. 选刊物（The Guardian / BBC News / The Atlantic / Scientific American / Reuters / NPR），点「拉取最新文章」
2. 点任意一篇 → 抓取原文正文 → **AI 只做标注**：挑 10 个核心词汇、逐段翻译
3. 也可以直接粘贴任意外刊文章链接精读

> ⚠️ 原文段落**一字不改**：AI 只返回「保留哪些段的索引」和译文，正文始终用抓取到的原文，避免模型转述失真。
> 免费刊物可拿到全文；硬付费墙（如 The Economist）抽不到、NYT 只给开头，此时会提示改用 AI 仿写。
> 原文只存在浏览器本地（localStorage），不写进数据库与仓库，并始终展示原文链接，仅供个人学习。

**AI 仿写**：选刊物 + 主题（可留空让 AI 自选），AI 按该刊文风仿写一篇并标注，不受付费墙限制。

精读界面两种来源通用：核心词汇文中高亮 → 点词弹释义 → 一键收入词库；逐段展开中文译文；单段朗读；文末核心词汇表。

**不认识别的词？直接划词。** 在正文里用鼠标选中（或双击）任意单词，会浮出一条快捷操作：

- **查这个词** → 跳到「添加单词」页，AI 自动补全音标 / 释义 / 例句 / 构词，确认后保存进词库（`?auto=1` 自动查询，不用再点一次）
- **词库搜索** → 跳到词库页并带上这个词，看看是不是早就收藏过（`/words?q=word`）

选中整个短语也可以查（按钮会变成「查这个短语」）。同一个浮条在 AI 阅读页也生效。

## 🗄 数据模型

| 表 | 说明 |
| --- | --- |
| `words` | 单词主表：释义、音标、例句(jsonb)、标签、词根，以及间隔重复字段（mastery_level / ease_factor / interval_days / next_review_at） |
| `review_logs` | 每次复习的反馈记录（know / fuzzy / forgot）与阶段变化 |
| `books` | 单词本（名称 + 语言），`words.book_id` 关联，删除单词本时单词保留 |
| `favorites` | 收藏本：短语 / 句子（kind 区分），支持翻译、备注与来源单词关联（source_word_id） |
| `songs` | 英文歌：标题、歌手、时长，音频与 LRC 歌词存 Storage 私有桶 `songs`，播放走签名 URL |
| `allowed_users` | 登录邮箱白名单，配合 RLS 做数据库层硬限制 |

所有表均开启 **RLS**，策略为 `auth.uid() = user_id AND is_allowed_user()`，即使有人修改前端代码也无法越权访问数据。

## 📁 项目结构

```
src/
├── components/      # 布局、UI 组件、动画组件（SpeakButton / Celebration 等）
├── pages/           # Dashboard / Words / WordDetail / AddWord / Review / Read / Favorites / Songs / SongPlayer / Settings / Login
├── services/        # Supabase 数据层、AI 服务、联网检索（Tavily）、间隔重复算法、数据缓存、备份
├── stores/          # Zustand（auth / settings / article）
├── i18n/            # 中英韩日四语字典
├── lib/             # supabase 客户端、工具函数、登录白名单
└── types/           # 全局类型定义
supabase/
└── schema.sql       # 建表 + 索引 + 触发器 + RLS（幂等）
```

## 🧩 常用命令

```bash
pnpm dev       # 开发
pnpm build     # 类型检查 + 构建
pnpm preview   # 预览构建产物
pnpm lint      # oxlint 代码检查
```

## 📸 截图

<table>
<tr>
  <td><img src="public/screenshots/01-dashboard.png" alt="Dashboard" width="420"></td>
  <td><img src="public/screenshots/02-words.png" alt="词库" width="420"></td>
</tr>
<tr>
  <td align="center"><b>Dashboard</b><br>今日任务 · 阅读入口 · 4 项核心统计</td>
  <td align="center"><b>词库</b><br>多语言单词本 · 响应式分页 · 筛选与标签</td>
</tr>
<tr>
  <td><img src="public/screenshots/03-read.png" alt="阅读" width="420"></td>
  <td><img src="public/screenshots/04-review.png" alt="复习" width="420"></td>
</tr>
<tr>
  <td align="center"><b>阅读</b><br>AI 生成文章 · 选中生词一键入库 · 整篇朗读</td>
  <td align="center"><b>复习</b><br>3D 翻转卡片 · 喇叭发音 · 三档反馈调度</td>
</tr>
<tr>
  <td><img src="public/screenshots/05-settings.png" alt="设置" width="420"></td>
  <td><img src="public/screenshots/06-add-word.png" alt="添加单词" width="420"></td>
</tr>
<tr>
  <td align="center"><b>设置</b><br>界面语言 · AI 服务 · 数据导入/导出</td>
  <td align="center"><b>添加单词</b><br>输入即自动补全 · 选择单词本 · 标签</td>
</tr>
</table>

## 📄 License

[MIT](LICENSE)

---

<div align="center">
  <sub>Made with 💚 · 一个给自己用的单词学习工具</sub>
</div>
