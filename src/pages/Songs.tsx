import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Music2, Plus, Trash2, Upload, FileAudio, FileText } from 'lucide-react'
import gsap from 'gsap'
import { fetchSongs, uploadSong, deleteSong } from '../services/songs'
import { useT } from '../i18n'
import type { Song } from '../types'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card } from '../components/ui/card'
import { Dialog, DialogContent, DialogTitle } from '../components/ui/dialog'
import { formatTime } from '../lib/lrc'

export default function Songs() {
  const t = useT()
  const [songs, setSongs] = useState<Song[]>([])
  const [loading, setLoading] = useState(true)
  const listRef = useRef<HTMLDivElement>(null)

  // 上传弹窗
  const [dialog, setDialog] = useState(false)
  const [title, setTitle] = useState('')
  const [artist, setArtist] = useState('')
  const [mp3, setMp3] = useState<File | null>(null)
  const [lrc, setLrc] = useState<File | null>(null)
  const [duration, setDuration] = useState<number | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const mp3Ref = useRef<HTMLInputElement>(null)
  const lrcRef = useRef<HTMLInputElement>(null)

  // 删除确认
  const [deleteTarget, setDeleteTarget] = useState<Song | null>(null)
  const [deleting, setDeleting] = useState(false)

  const load = () => {
    setLoading(true)
    fetchSongs()
      .then(setSongs)
      .catch(console.error)
      .finally(() => setLoading(false))
  }
  useEffect(load, [])

  // 列表交错入场
  useEffect(() => {
    if (loading || !listRef.current) return
    gsap.fromTo(
      listRef.current.children,
      { opacity: 0, y: 16 },
      { opacity: 1, y: 0, duration: 0.32, stagger: 0.05, ease: 'power2.out' },
    )
  }, [loading, songs])

  /** 选中 mp3 后预读时长 */
  const pickMp3 = (file: File | null) => {
    setMp3(file)
    setDuration(null)
    if (!file) return
    const url = URL.createObjectURL(file)
    const audio = new Audio()
    audio.preload = 'metadata'
    audio.onloadedmetadata = () => {
      setDuration(audio.duration)
      URL.revokeObjectURL(url)
    }
    audio.onerror = () => URL.revokeObjectURL(url)
    audio.src = url
    // 默认用文件名当歌名
    if (!title) setTitle(file.name.replace(/\.mp3$/i, ''))
  }

  const handleUpload = async () => {
    if (!mp3 || !lrc || !title.trim()) return
    setUploading(true)
    setError(null)
    try {
      await uploadSong({ title, artist, mp3, lrc, duration })
      setDialog(false)
      setTitle('')
      setArtist('')
      setMp3(null)
      setLrc(null)
      setDuration(null)
      load()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.')
    } finally {
      setUploading(false)
    }
  }

  const handleDelete = async () => {
    if (!deleteTarget) return
    setDeleting(true)
    try {
      await deleteSong(deleteTarget)
      setDeleteTarget(null)
      load()
    } catch (e) {
      console.error(e)
    } finally {
      setDeleting(false)
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-black text-ink">
          <Music2 size={24} className="text-duo-blue" /> {t('song.title')}
        </h1>
        <Button size="sm" onClick={() => setDialog(true)}>
          <Plus size={16} /> {t('song.upload')}
        </Button>
      </div>

      {loading ? (
        <p className="py-10 text-center font-bold text-ink-soft">{t('common.loading')}</p>
      ) : songs.length === 0 ? (
        <p className="py-10 text-center font-bold text-ink-soft">{t('song.empty')}</p>
      ) : (
        <div ref={listRef} className="flex flex-col gap-2.5">
          {songs.map((s) => (
            <Card key={s.id} className="flex items-center justify-between gap-3 p-4 transition-colors hover:border-duo-blue">
              <Link to={`/songs/${s.id}`} className="flex min-w-0 flex-1 items-center gap-3">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-duo-blue/10">
                  <Music2 size={22} className="text-duo-blue" />
                </span>
                <div className="min-w-0">
                  <p className="truncate font-black text-ink">{s.title}</p>
                  <p className="truncate text-sm font-semibold text-ink-soft">
                    {s.artist || t('song.unknownArtist')}
                    {s.duration ? ` · ${formatTime(s.duration)}` : ''}
                  </p>
                </div>
              </Link>
              <button
                onClick={() => setDeleteTarget(s)}
                className="shrink-0 cursor-pointer rounded-full p-1.5 text-gray-300 transition-colors hover:bg-duo-red/10 hover:text-duo-red"
                aria-label={t('common.delete')}
              >
                <Trash2 size={16} />
              </button>
            </Card>
          ))}
        </div>
      )}

      {/* 上传弹窗 */}
      <Dialog open={dialog} onOpenChange={setDialog}>
        <DialogContent>
          <DialogTitle>{t('song.upload')}</DialogTitle>
          <div className="mt-4 flex flex-col gap-3">
            <Input placeholder={t('song.titlePh')} value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder={t('song.artistPh')} value={artist} onChange={(e) => setArtist(e.target.value)} />

            <input
              ref={mp3Ref}
              type="file"
              accept="audio/mpeg,audio/mp3,.mp3"
              className="hidden"
              onChange={(e) => pickMp3(e.target.files?.[0] ?? null)}
            />
            <input
              ref={lrcRef}
              type="file"
              accept=".lrc,text/plain"
              className="hidden"
              onChange={(e) => setLrc(e.target.files?.[0] ?? null)}
            />

            <div className="flex gap-2">
              <Button variant="outline" className="flex-1" onClick={() => mp3Ref.current?.click()}>
                <FileAudio size={16} /> {mp3 ? mp3.name : t('song.pickAudio')}
              </Button>
              <Button variant="outline" className="flex-1" onClick={() => lrcRef.current?.click()}>
                <FileText size={16} /> {lrc ? lrc.name : t('song.pickLrc')}
              </Button>
            </div>
            <p className="text-xs font-bold text-gray-400">{t('song.filesHint')}</p>

            {error && <p className="text-sm font-bold text-duo-red">{error}</p>}
            <Button onClick={handleUpload} disabled={uploading || !mp3 || !lrc || !title.trim()}>
              <Upload size={16} /> {uploading ? t('song.uploading') : t('song.upload')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* 删除确认弹窗 */}
      <Dialog open={deleteTarget !== null} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogTitle>{t('song.deleteTitle')}</DialogTitle>
          {deleteTarget && (
            <p className="mt-2 rounded-xl bg-paper px-3 py-2.5 font-bold text-ink">
              {deleteTarget.title}
            </p>
          )}
          <p className="mt-1 font-semibold text-ink-soft">{t('song.deleteMsg')}</p>
          <div className="mt-5 flex gap-2">
            <Button variant="danger" className="flex-1" disabled={deleting} onClick={handleDelete}>
              {deleting ? t('common.loading') : t('common.delete')}
            </Button>
            <Button variant="ghost" className="flex-1" onClick={() => setDeleteTarget(null)}>
              {t('common.cancel')}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
