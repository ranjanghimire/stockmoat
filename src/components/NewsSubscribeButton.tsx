import { useCallback, useState, type FormEvent } from 'react'

type ModalState = 'idle' | 'submitting' | 'done'

export function NewsSubscribeButton() {
  const [open, setOpen] = useState(false)
  const [email, setEmail] = useState('')
  const [state, setState] = useState<ModalState>('idle')
  const [message, setMessage] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setState('idle')
    setError(null)
    if (state === 'done') setEmail('')
  }, [state])

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault()
    setState('submitting')
    setError(null)
    setMessage(null)
    try {
      const res = await fetch('/api/news-subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim() }),
      })
      const data = (await res.json()) as { ok?: boolean; message?: string; error?: string }
      if (!res.ok || !data.ok) {
        setError(data.message ?? data.error ?? 'Subscription failed.')
        setState('idle')
        return
      }
      setMessage(data.message ?? 'Check your inbox to confirm.')
      setState('done')
    } catch {
      setError('Could not reach the server. Try again from the deployed site.')
      setState('idle')
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="shrink-0 rounded-lg bg-moat-ink px-3 py-1.5 text-sm font-medium text-white shadow-sm transition hover:bg-moat-ink/90"
      >
        Subscribe
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4 backdrop-blur-sm"
          role="dialog"
          aria-labelledby="subscribe-title"
          onClick={(ev) => {
            if (ev.target === ev.currentTarget) close()
          }}
        >
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-5 shadow-xl">
            <div className="flex items-start justify-between gap-3">
              <h2 id="subscribe-title" className="text-lg font-semibold text-moat-ink">
                Email digest
              </h2>
              <button
                type="button"
                onClick={close}
                className="rounded-md px-2 py-1 text-slate-500 hover:bg-slate-100"
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              Hourly email when new material events are published. Confirm via the link we send you.
            </p>

            {state === 'done' ? (
              <p className="mt-4 text-sm text-emerald-800" role="status">
                {message}
              </p>
            ) : (
              <form onSubmit={onSubmit} className="mt-4 space-y-3">
                <label className="block text-sm font-medium text-slate-700">
                  Email
                  <input
                    type="email"
                    required
                    autoComplete="email"
                    value={email}
                    onChange={(ev) => setEmail(ev.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-moat-accent/30"
                    placeholder="you@example.com"
                    disabled={state === 'submitting'}
                  />
                </label>
                {error && (
                  <p className="text-sm text-red-700" role="alert">
                    {error}
                  </p>
                )}
                <button
                  type="submit"
                  disabled={state === 'submitting'}
                  className="w-full rounded-xl bg-moat-ink py-2 text-sm font-medium text-white disabled:opacity-60"
                >
                  {state === 'submitting' ? 'Sending…' : 'Subscribe'}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  )
}
