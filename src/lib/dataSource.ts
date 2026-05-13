/**
 * Optional Yahoo path in **dev only** (experimental).
 *
 * Uses the **`yahoo-finance2`** npm package (Node/JS) on the Vite dev server — not Python **`yfinance`**.
 * Yahoo rate-limits unofficial callers heavily, so this is **opt-in**: set `VITE_USE_YAHOO=true` in `.env.local`
 * and restart Vite. Default dev behavior is FMP when `fmpApiKey` is set (see `shouldFetchFmpPeerMedians`).
 */
export function isYahooDevProvider(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_YAHOO === 'true'
}

/**
 * FMP peer key-metrics calls are skipped in dev unless `VITE_FMP_FETCH_PEERS=true`
 * (avoids dozens of extra requests while iterating locally).
 */
export function shouldFetchFmpPeerMedians(): boolean {
  if (import.meta.env.PROD) return true
  return import.meta.env.VITE_FMP_FETCH_PEERS === 'true'
}
