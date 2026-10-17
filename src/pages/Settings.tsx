import { useRef, useState } from 'react'
import {
  KeyRound,
  Globe,
  Cpu,
  LogOut,
  Check,
  Languages,
  Database,
  Download,
  Upload,
  Lightbulb,
  GraduationCap,
  FileCode2,
} from 'lucide-react'
import { useNavigate } from 'react-router-dom'
import { useSettings } from '../stores/settings'
import { useAuth } from '../stores/auth'
import { useT, LANGUAGES } from '../i18n'
import { exportData, downloadBackup, importData, isValidBackup } from '../services/backup'
import { exportWordsHtml } from '../services/exportHtml'
import { Button } from '../components/ui/button'
import { Input } from '../components/ui/input'
import { Card, CardTitle } from '../components/ui/card'
import { AILoading } from '../components/AILoading'

export default function Settings() {
  const {
    apiKey,
    baseUrl,
    model,
    language,
    interests,
    tavilyKey,
    dailyNewWords,
    setApiKey,
    setBaseUrl,
    setModel,
    setLanguage,
    setInterests,
    setTavilyKey,
    setDailyNewWords,
  } = useSettings()
  const signOut = useAuth((s) => s.signOut)
  const email = useAuth((s) => s.session?.user?.email)
  const navigate = useNavigate()
  const t = useT()
  const [saved, setSaved] = useState(false)

  // 数据导入/导出
  const fileRef = useRef<HTMLInputElement>(null)
  const [busy, setBusy] = useState(false)
  const [result, setResult] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const handleSave = () => {
    setSaved(true)
    setTimeout(() => setSaved(false), 1500)
  }

  /** 导出：拉取全部数据并下载 JSON */
  const handleExport = async () => {
    setBusy(true)
    setError(null)
    try {
      const data = await exportData()
      downloadBackup(data)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  /** 导出全部单词为美观的 HTML 页面 */
  const handleExportHtml = async () => {
    setBusy(true)
    setError(null)
    try {
      await exportWordsHtml()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Export failed.')
    } finally {
      setBusy(false)
    }
  }

  /** 导入：读取 JSON 文件 → 校验 → 写回 Supabase */
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    e.target.value = '' // 允许重复选择同一文件
    if (!file) return
    setBusy(true)
    setError(null)
    setResult(null)
    try {
      const parsed = JSON.parse(await file.text())
      if (!isValidBackup(parsed)) {
        setError(t('settings.invalidFile'))
        return
      }
      const r = await importData(parsed)
      setResult(
        t('settings.importDone')
          .replace('{words}', String(r.words))
          .replace('{books}', String(r.books))
          .replace('{logs}', String(r.logs))
          .replace('{skipped}', String(r.skippedWords)),
      )
    } catch (e) {
      setError(e instanceof Error ? e.message : t('settings.invalidFile'))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <h1 className="text-2xl font-black text-ink">{t('settings.title')}</h1>

      {/* 界面语言 */}
      <Card className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-2">
          <Languages size={18} className="text-duo" /> {t('settings.language')}
        </CardTitle>
        <div className="grid grid-cols-2 gap-2">
          {LANGUAGES.map((l) => (
            <button
              key={l.code}
              onClick={() => setLanguage(l.code)}
              className={`cursor-pointer rounded-2xl border-2 px-4 py-3 text-base font-extrabold transition-colors ${
                language === l.code
                  ? 'border-duo bg-duo/10 text-duo'
                  : 'border-gray-200 bg-white text-ink-soft hover:border-gray-300'
              }`}
            >
              {l.native}
            </button>
          ))}
        </div>
      </Card>

      <Card className="flex flex-col gap-4">
        <CardTitle className="flex items-center gap-2">
          <Cpu size={18} className="text-duo-blue" /> {t('settings.aiProvider')}
        </CardTitle>
        <p className="text-sm font-semibold text-ink-soft">{t('settings.aiDesc')}</p>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-ink-soft">
            <KeyRound size={14} /> {t('settings.apiKey')}
          </span>
          <Input
            type="password"
            placeholder="sk-…"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-ink-soft">
            <Globe size={14} /> {t('settings.baseUrl')}
          </span>
          <Input
            placeholder="https://api.openai.com/v1"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </label>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-ink-soft">
            <Cpu size={14} /> {t('settings.model')}
          </span>
          <Input
            placeholder="gpt-4o-mini"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </label>

        <Button onClick={handleSave} variant={saved ? 'primary' : 'secondary'}>
          {saved ? (
            <>
              <Check size={16} /> {t('settings.saved')}
            </>
          ) : (
            t('settings.save')
          )}
        </Button>
      </Card>

      {/* 阅读偏好：兴趣方向（用于 AI 话题推荐） */}
      <Card className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-2">
          <Lightbulb size={18} className="text-duo-yellow-dark" /> {t('settings.interests')}
        </CardTitle>
        <p className="text-sm font-semibold text-ink-soft">{t('settings.interestsDesc')}</p>
        <Input
          placeholder={t('settings.interestsPh')}
          value={interests}
          onChange={(e) => setInterests(e.target.value)}
        />
      </Card>

      {/* 联网搜索：生成文章前先检索最新资料 */}
      <Card className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-2">
          <Globe size={18} className="text-duo" /> {t('settings.search')}
        </CardTitle>
        <p className="text-sm font-semibold text-ink-soft">{t('settings.searchDesc')}</p>
        <label className="flex flex-col gap-1.5">
          <span className="flex items-center gap-1.5 text-xs font-extrabold uppercase text-ink-soft">
            <KeyRound size={14} /> {t('settings.searchKey')}
          </span>
          <Input
            type="password"
            placeholder="tvly-…"
            value={tavilyKey}
            onChange={(e) => setTavilyKey(e.target.value)}
          />
        </label>
        <p className="text-xs font-semibold text-ink-soft">
          {t('settings.searchLocalOnly')}{' '}
          <a
            href="https://tavily.com"
            target="_blank"
            rel="noreferrer"
            className="font-extrabold text-duo-blue underline decoration-dotted"
          >
            tavily.com
          </a>
        </p>
      </Card>

      {/* 背单词：每轮新词数 */}
      <Card className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-2">
          <GraduationCap size={18} className="text-duo" /> {t('settings.study')}
        </CardTitle>
        <p className="text-sm font-semibold text-ink-soft">{t('settings.newWordsDesc')}</p>
        <div className="flex gap-2">
          {[5, 10, 15, 20].map((n) => (
            <button
              key={n}
              onClick={() => setDailyNewWords(n)}
              className={`cursor-pointer rounded-2xl border-2 px-5 py-2.5 text-base font-extrabold transition-colors ${
                dailyNewWords === n
                  ? 'border-duo bg-duo/10 text-duo'
                  : 'border-gray-200 bg-white text-ink-soft hover:border-gray-300'
              }`}
            >
              {n}
            </button>
          ))}
        </div>
      </Card>

      {/* 数据导入 / 导出 */}
      <Card className="flex flex-col gap-3">
        <CardTitle className="flex items-center gap-2">
          <Database size={18} className="text-duo" /> {t('settings.data')}
        </CardTitle>
        <p className="text-sm font-semibold text-ink-soft">{t('settings.dataDesc')}</p>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={handleExport} disabled={busy}>
            <Download size={16} /> {t('settings.export')}
          </Button>
          <Button variant="outline" onClick={handleExportHtml} disabled={busy}>
            <FileCode2 size={16} /> {t('settings.exportHtml')}
          </Button>
          <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Upload size={16} /> {t('settings.import')}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={handleFileChange}
          />
        </div>

        {busy && <AILoading label={t('settings.importing')} />}
        {result && <p className="text-sm font-bold text-duo-dark">{result}</p>}
        {error && <p className="text-sm font-bold text-duo-red">{error}</p>}
      </Card>

      <Card className="flex flex-col gap-3">
        <CardTitle>{t('settings.account')}</CardTitle>
        {email && (
          <p className="rounded-xl bg-paper px-3 py-2.5 text-sm font-bold text-ink">{email}</p>
        )}
        <Button
          variant="outline"
          onClick={async () => {
            await signOut()
            navigate('/login')
          }}
        >
          <LogOut size={16} /> {t('settings.signOut')}
        </Button>
      </Card>
    </div>
  )
}
