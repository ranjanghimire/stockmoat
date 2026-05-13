/** In dev, use Yahoo via the Vite dev server unless `VITE_USE_FMP=true` in `.env.local`. */
export function isYahooDevProvider(): boolean {
  return import.meta.env.DEV && import.meta.env.VITE_USE_FMP !== 'true'
}

/**
 * FMP peer key-metrics calls are skipped in dev unless `VITE_FMP_FETCH_PEERS=true`
 * (avoids dozens of extra requests while iterating locally).
 */
export function shouldFetchFmpPeerMedians(): boolean {
  if (import.meta.env.PROD) return true
  return import.meta.env.VITE_FMP_FETCH_PEERS === 'true'
}
