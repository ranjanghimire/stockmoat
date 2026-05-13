/**
 * Optional Yahoo path in **dev only** — kept as a **backup** when FMP is unavailable or you want fewer API calls.
 * Primary path: **FMP** whenever `fmpApiKey` is set (do not set `VITE_USE_YAHOO`, or leave it unset).
 *
 * Uses the **`yahoo-finance2`** npm package (Node/JS) on the Vite dev server — not Python **`yfinance`**.
 * Yahoo rate-limits unofficial callers; opt in with `VITE_USE_YAHOO=true` in `.env.local` and restart Vite.
 */
export function isYahooDevProvider(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_YAHOO === 'true'
}

/**
 * FMP peer key-metrics: **on** in production. In dev, **on by default** so peer-relative
 * lines get real medians; set `VITE_FMP_FETCH_PEERS=false` in `.env.local` to skip extra calls.
 */
export function shouldFetchFmpPeerMedians(): boolean {
  if (import.meta.env.PROD) return true
  return import.meta.env.VITE_FMP_FETCH_PEERS !== 'false'
}

/**
 * FMP peer medians when the pipeline runs outside the Vite client (e.g. nightly Node script).
 * Peers on by default; set `SCREEN_FETCH_PEERS=false` to skip extra calls.
 */
export function defaultFetchPeersForFmpPipeline(): boolean {
  const env = typeof import.meta !== 'undefined' ? import.meta.env : undefined
  if (env && typeof env.DEV === 'boolean') {
    return shouldFetchFmpPeerMedians()
  }
  if (typeof process !== 'undefined' && process.env) {
    return process.env.SCREEN_FETCH_PEERS !== 'false'
  }
  return true
}
