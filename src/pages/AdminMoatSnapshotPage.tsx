import { useCallback, useState } from 'react'

type LoadResponse =
  | {
      exists: false
      symbol: string
      body: string
      how_they_make_money_body: string
      recent_deals_body: string
      content_source: null
    }
  | {
      exists: true
      symbol: string
      body: string
      how_they_make_money_body: string
      recent_deals_body: string
      content_source: string | null
    }

function adminApiUrl(): string {
  const raw = import.meta.env.VITE_ADMIN_MOAT_API_URL?.trim()
  if (!raw) return '/api/admin-moat-snapshot'
  if (/\/api\/admin-moat-snapshot$/i.test(raw)) return raw
  return `${raw.replace(/\/$/, '')}/api/admin-moat-snapshot`
}

export default function AdminMoatSnapshotPage() {
  const [passphrase, setPassphrase] = useState('')
  const [tickerInput, setTickerInput] = useState('')
  const [activeTicker, setActiveTicker] = useState('')
  const [moatBody, setMoatBody] = useState('')
  const [howBody, setHowBody] = useState('')
  const [dealsBody, setDealsBody] = useState('')
  const [contentSource, setContentSource] = useState<string | null>(null)
  const [rowExists, setRowExists] = useState<boolean | null>(null)
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ tone: 'ok' | 'err'; text: string } | null>(null)

  const loadRow = useCallback(
    async (sym: string, pass: string) => {
      setBusy(true)
      setMessage(null)
      try {
        const res = await fetch(adminApiUrl(), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ passphrase: pass, ticker: sym, action: 'load' }),
        })
        const j = (await res.json()) as LoadResponse & { error?: string }
        if (!res.ok) {
          setMessage({ tone: 'err', text: j.error ?? res.statusText })
          return
        }
        setActiveTicker(sym)
        setRowExists(j.exists)
        setMoatBody(j.body ?? '')
        setHowBody(j.how_they_make_money_body ?? '')
        setDealsBody(j.recent_deals_body ?? '')
        setContentSource('content_source' in j ? j.content_source : null)
        setMessage({
          tone: 'ok',
          text: j.exists ? `Loaded ${sym} from database.` : `No row yet for ${sym} — fill fields and save.`,
        })
      } catch (e) {
        setMessage({ tone: 'err', text: e instanceof Error ? e.message : String(e) })
      } finally {
        setBusy(false)
      }
    },
    [],
  )

  const onLoad = () => {
    const sym = tickerInput.trim().toUpperCase()
    if (!sym) {
      setMessage({ tone: 'err', text: 'Enter a ticker.' })
      return
    }
    if (!passphrase.trim()) {
      setMessage({ tone: 'err', text: 'Enter the admin passphrase.' })
      return
    }
    void loadRow(sym, passphrase)
  }

  const onSave = async () => {
    const sym = (activeTicker || tickerInput).trim().toUpperCase()
    if (!sym) {
      setMessage({ tone: 'err', text: 'Load or enter a ticker first.' })
      return
    }
    if (!passphrase.trim()) {
      setMessage({ tone: 'err', text: 'Enter the admin passphrase.' })
      return
    }
    if (!moatBody.trim()) {
      setMessage({ tone: 'err', text: "What's the moat? cannot be empty (database requires it)." })
      return
    }
    setBusy(true)
    setMessage(null)
    try {
      const res = await fetch(adminApiUrl(), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          passphrase,
          ticker: sym,
          action: 'save',
          body: moatBody,
          how_they_make_money_body: howBody,
          recent_deals_body: dealsBody,
        }),
      })
      const j = (await res.json()) as { ok?: boolean; error?: string }
      if (!res.ok) {
        setMessage({ tone: 'err', text: j.error ?? res.statusText })
        return
      }
      setMessage({ tone: 'ok', text: `Saved ${sym} as curated content.` })
      await loadRow(sym, passphrase)
    } catch (e) {
      setMessage({ tone: 'err', text: e instanceof Error ? e.message : String(e) })
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <h1 className="font-display text-2xl text-moat-ink">MOAT snapshot admin</h1>
      <p className="mt-2 text-sm text-slate-600">
        Edit the three MOAT ANALYSIS subsections for any ticker. Row is stored as{' '}
        <span className="font-mono text-slate-800">content_source = curated</span>. Not linked from the main
        nav; bookmark this path. Requires{' '}
        <span className="font-mono text-slate-800">MOAT_ADMIN_PASSPHRASE</span> on the server (Vercel env).
      </p>
      <p className="mt-2 text-xs text-slate-500">
        Local Vite: set <span className="font-mono">VITE_ADMIN_MOAT_API_URL</span> to your deployed origin (e.g.{' '}
        <span className="font-mono">https://your-app.vercel.app</span>) or run{' '}
        <span className="font-mono">vercel dev</span> with a Vite proxy to hit <span className="font-mono">/api</span>.
      </p>

      <div className="mt-8 space-y-4 rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
        <label className="block text-sm font-medium text-slate-700">
          Admin passphrase
          <input
            type="password"
            autoComplete="off"
            value={passphrase}
            onChange={(e) => setPassphrase(e.target.value)}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
            placeholder="From MOAT_ADMIN_PASSPHRASE"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Ticker
          <input
            type="text"
            value={tickerInput}
            onChange={(e) => setTickerInput(e.target.value.toUpperCase())}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 font-mono text-slate-900"
            placeholder="e.g. IREN"
          />
        </label>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={() => void onLoad()}
            className="rounded-lg bg-moat-ink px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Load from database
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onSave()}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-800 disabled:opacity-50"
          >
            Save (curated)
          </button>
        </div>

        {activeTicker ? (
          <p className="text-xs text-slate-500">
            Active: <span className="font-mono font-medium text-slate-700">{activeTicker}</span>
            {rowExists === false ? ' — new row on save' : null}
            {contentSource ? (
              <>
                {' '}
                · <span className="font-mono">{contentSource}</span>
              </>
            ) : null}
          </p>
        ) : null}

        {message ? (
          <p
            className={`text-sm ${message.tone === 'ok' ? 'text-emerald-700' : 'text-red-600'}`}
            role="status"
          >
            {message.text}
          </p>
        ) : null}

        <label className="block text-sm font-medium text-slate-700">
          What&apos;s the moat? <span className="text-red-600">*</span>
          <textarea
            value={moatBody}
            onChange={(e) => setMoatBody(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          How they make money
          <textarea
            value={howBody}
            onChange={(e) => setHowBody(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
          />
        </label>
        <label className="block text-sm font-medium text-slate-700">
          Recent deals and partnerships
          <p className="mt-0.5 text-xs font-normal text-slate-500">Leave empty to clear this subsection in the database.</p>
          <textarea
            value={dealsBody}
            onChange={(e) => setDealsBody(e.target.value)}
            rows={4}
            className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-slate-900"
          />
        </label>
      </div>
    </div>
  )
}
