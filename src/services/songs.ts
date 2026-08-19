import { supabase } from '../lib/supabase'
import { cachedFetch, invalidateCache } from './cache'
import type { Song } from '../types'

// ============================================================
// 英文歌（songs）：音频 + LRC 歌词上传 / 列表 / 删除
// 文件存 Supabase Storage 私有桶 'songs'，播放走签名 URL
// ============================================================

const BUCKET = 'songs'

/** 歌曲列表（创建时间倒序，带缓存） */
export async function fetchSongs(): Promise<Song[]> {
  return cachedFetch('songs', async () => {
    const { data, error } = await supabase
      .from('songs')
      .select('*')
      .order('created_at', { ascending: false })
    if (error) throw error
    return (data ?? []) as Song[]
  })
}

/** 取单首歌（含音频/歌词的签名 URL，有效期 1 小时） */
export async function fetchSong(id: string): Promise<{ song: Song; audioUrl: string; lrcUrl: string }> {
  const { data, error } = await supabase.from('songs').select('*').eq('id', id).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Song not found')
  const song = data as Song

  const [audioRes, lrcRes] = await Promise.all([
    supabase.storage.from(BUCKET).createSignedUrl(song.audio_path, 3600),
    supabase.storage.from(BUCKET).createSignedUrl(song.lrc_path, 3600),
  ])
  if (audioRes.error) throw audioRes.error
  if (lrcRes.error) throw lrcRes.error
  return { song, audioUrl: audioRes.data.signedUrl, lrcUrl: lrcRes.data.signedUrl }
}

/**
 * 上传歌曲：mp3 + lrc 文件存 Storage，再写 songs 行。
 * 文件路径前缀用户 id，避免重名。
 */
export async function uploadSong(input: {
  title: string
  artist: string
  mp3: File
  lrc: File
  duration: number | null
}): Promise<Song> {
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) throw new Error('Not signed in')

  const uid = crypto.randomUUID()
  const audioPath = `${user.id}/${uid}.mp3`
  const lrcPath = `${user.id}/${uid}.lrc`

  const [audioUp, lrcUp] = await Promise.all([
    supabase.storage.from(BUCKET).upload(audioPath, input.mp3, { contentType: input.mp3.type || 'audio/mpeg' }),
    supabase.storage.from(BUCKET).upload(lrcPath, input.lrc, { contentType: 'text/plain' }),
  ])
  if (audioUp.error) throw audioUp.error
  if (lrcUp.error) {
    await supabase.storage.from(BUCKET).remove([audioPath]) // 回滚已上传的音频
    throw lrcUp.error
  }

  const { data, error } = await supabase
    .from('songs')
    .insert({
      user_id: user.id,
      title: input.title.trim(),
      artist: input.artist.trim() || null,
      audio_path: audioPath,
      lrc_path: lrcPath,
      duration: input.duration,
    })
    .select()
    .single()
  if (error) {
    await supabase.storage.from(BUCKET).remove([audioPath, lrcPath]) // 回滚
    throw error
  }
  invalidateCache('songs')
  return data as Song
}

/** 删除歌曲：先删存储文件再删行 */
export async function deleteSong(song: Song): Promise<void> {
  await supabase.storage.from(BUCKET).remove([song.audio_path, song.lrc_path])
  const { error } = await supabase.from('songs').delete().eq('id', song.id)
  if (error) throw error
  invalidateCache('songs')
}
