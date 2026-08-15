-- ============================================================
-- Word Learning App — Supabase Schema
-- Run this in: Supabase Dashboard → SQL Editor → New query
-- ============================================================

-- ---------- 1. words: 核心词库 ----------
create table if not exists public.words (
  id                uuid primary key default gen_random_uuid(),
  user_id           uuid not null default auth.uid() references auth.users(id) on delete cascade,

  word              text not null,
  phonetic          text,                          -- 音标，如 /ˈæpəl/
  meaning_cn        text,                          -- 中文释义
  meaning_en        text,                          -- 英文释义
  part_of_speech    text,                          -- 词性，如 "n. / v."
  example_sentences jsonb not null default '[]',   -- [{ "en": "...", "cn": "..." }]
  root_affix        text,                          -- 词根词缀解释
  notes             text,                          -- 用户笔记 / AI 增强内容存档
  tags              text[] not null default '{}',  -- 自定义标签

  -- 间隔重复（艾宾浩斯 / Anki 简化版）字段
  mastery_level     int  not null default 0,       -- 当前阶段 0~7（对应 interval 阶梯）
  ease_factor       real not null default 2.5,     -- 难度系数（SM-2）
  interval_days     real not null default 0,       -- 当前间隔（天，可为小数表示分钟级）
  next_review_at    timestamptz not null default now(),
  review_count      int  not null default 0,
  correct_count     int  not null default 0,

  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now(),

  unique (user_id, word)
);

-- ---------- 2. review_logs: 复习历史 ----------
create table if not exists public.review_logs (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null default auth.uid() references auth.users(id) on delete cascade,
  word_id      uuid not null references public.words(id) on delete cascade,

  feedback     text not null check (feedback in ('know', 'fuzzy', 'forgot')),
  stage_before int  not null,
  stage_after  int  not null,

  reviewed_at  timestamptz not null default now()
);

-- ---------- 3. books: 单词本（不同语言） ----------
create table if not exists public.books (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users(id) on delete cascade,
  name       text not null,
  language   text not null default 'en',   -- en / zh / ko / ja
  created_at timestamptz not null default now()
);

-- 兼容旧库：给 words 补上所属单词本字段（幂等）
alter table public.words
  add column if not exists book_id uuid references public.books(id) on delete set null;

create index if not exists idx_books_user        on public.books (user_id, created_at desc);
create index if not exists idx_words_user_book   on public.words (user_id, book_id);

-- ---------- 4. 索引 ----------
create index if not exists idx_words_user_next_review on public.words (user_id, next_review_at);
create index if not exists idx_words_user_tags        on public.words using gin (tags);
create index if not exists idx_words_user_created     on public.words (user_id, created_at desc);
create index if not exists idx_review_logs_word       on public.review_logs (word_id, reviewed_at desc);
create index if not exists idx_review_logs_user_date  on public.review_logs (user_id, reviewed_at desc);

-- ---------- 5. updated_at 自动更新触发器 ----------
-- 兼容旧库：如果之前已经建过表，给 user_id 补上默认值（否则客户端不传 user_id 会被 RLS 拒绝 → 403）
-- 幂等，可重复执行
alter table public.words       alter column user_id set default auth.uid();
alter table public.review_logs alter column user_id set default auth.uid();
alter table public.books       alter column user_id set default auth.uid();

create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

drop trigger if exists trg_words_updated_at on public.words;
create trigger trg_words_updated_at
  before update on public.words
  for each row execute function public.set_updated_at();

-- ---------- 5. 仅允许指定邮箱（个人专属硬限制） ----------
-- 只有白名单里的邮箱能读写任何数据；改前端代码也绕不过这一层
create table if not exists public.allowed_users (
  email      text primary key,
  created_at timestamptz not null default now()
);

-- ★ 把下面这行改成你自己的 Google 邮箱，然后再执行（可重复执行，不会报错）
insert into public.allowed_users (email) values ('you@gmail.com')
  on conflict (email) do nothing;

-- 白名单表不允许应用层（anon / authenticated）直接读写，只能通过下面的函数间接判断
revoke all on public.allowed_users from anon, authenticated;

create or replace function public.is_allowed_user()
returns boolean language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.allowed_users
    where lower(email) = lower(auth.jwt() ->> 'email')
  );
$$;

grant execute on function public.is_allowed_user() to anon, authenticated;

-- ---------- 7. RLS（个人使用也开启，防止 anon key 泄露导致数据裸露） ----------
alter table public.words       enable row level security;
alter table public.review_logs enable row level security;
alter table public.books       enable row level security;

create policy "words: owner select" on public.words
  for select using (auth.uid() = user_id and public.is_allowed_user());
create policy "words: owner insert" on public.words
  for insert with check (auth.uid() = user_id and public.is_allowed_user());
create policy "words: owner update" on public.words
  for update using (auth.uid() = user_id and public.is_allowed_user())
  with check (auth.uid() = user_id and public.is_allowed_user());
create policy "words: owner delete" on public.words
  for delete using (auth.uid() = user_id and public.is_allowed_user());

create policy "logs: owner select" on public.review_logs
  for select using (auth.uid() = user_id and public.is_allowed_user());
create policy "logs: owner insert" on public.review_logs
  for insert with check (auth.uid() = user_id and public.is_allowed_user());
create policy "logs: owner delete" on public.review_logs
  for delete using (auth.uid() = user_id and public.is_allowed_user());

create policy "books: owner select" on public.books
  for select using (auth.uid() = user_id and public.is_allowed_user());
create policy "books: owner insert" on public.books
  for insert with check (auth.uid() = user_id and public.is_allowed_user());
create policy "books: owner update" on public.books
  for update using (auth.uid() = user_id and public.is_allowed_user())
  with check (auth.uid() = user_id and public.is_allowed_user());
create policy "books: owner delete" on public.books
  for delete using (auth.uid() = user_id and public.is_allowed_user());

-- ---------- 8. favorites: 收藏本（短语 / 句子） ----------
create table if not exists public.favorites (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null default auth.uid() references auth.users(id) on delete cascade,
  kind            text not null check (kind in ('phrase', 'sentence')),  -- phrase 短语 / sentence 句子
  content         text not null,                      -- 原文内容
  translation     text,                               -- 翻译 / 释义（可选）
  note            text,                               -- 备注（可选）
  source_word_id  uuid references public.words(id) on delete set null,  -- 来源单词（可选）
  created_at      timestamptz not null default now()
);

create index if not exists idx_favorites_user on public.favorites (user_id, kind, created_at desc);

alter table public.favorites enable row level security;

create policy "favorites: owner select" on public.favorites
  for select using (auth.uid() = user_id and public.is_allowed_user());
create policy "favorites: owner insert" on public.favorites
  for insert with check (auth.uid() = user_id and public.is_allowed_user());
create policy "favorites: owner update" on public.favorites
  for update using (auth.uid() = user_id and public.is_allowed_user())
  with check (auth.uid() = user_id and public.is_allowed_user());
create policy "favorites: owner delete" on public.favorites
  for delete using (auth.uid() = user_id and public.is_allowed_user());
