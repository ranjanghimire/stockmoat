import type { IncomingMessage } from 'node:http'
import type { Plugin } from 'vite'

const CACHE_MS = 60_000
const RETRY_DELAYS_MS = [0, 6_000, 15_000]

function isRetryableYahooFailure(message: string): boolean {
  return (
    /Too Many Requests/i.test(message) ||
    /Unexpected token ['"]T['"]/i.test(message) ||
    /\b429\b/.test(message) ||
    /rate.?limit/i.test(message) ||
    /ECONNRESET|ETIMEDOUT|ENOTFOUND/i.test(message)
  )
}

function publicYahooError(e: unknown): { status: number; payload: { error: string; code: string } } {
  const raw = e instanceof Error ? e.message : String(e)
  const rateLimited = isRetryableYahooFailure(raw)
  if (rateLimited) {
    return {
      status: 429,
      payload: {
        code: 'YAHOO_RATE_LIMIT',
        error:
          'Yahoo Finance rate-limited this request (plain-text "Too Many Requests" or similar). Wait 1–2 minutes, try again, or use FMP: set VITE_USE_FMP=true and fmpApiKey in .env.local, then restart Vite.',
      },
    }
  }
  return {
    status: 502,
    payload: {
      code: 'YAHOO_ERROR',
      error: raw.length > 600 ? `${raw.slice(0, 600)}…` : raw,
    },
  }
}

async function sleep(ms: number): Promise<void> {
  await new Promise((r) => setTimeout(r, ms))
}

export function yahooDevCompanyPlugin(): Plugin {
  const cache = new Map<string, { expires: number; json: string }>()

  return {
    name: 'yahoo-dev-company-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req: IncomingMessage, res, next) => {
        if (!req.url?.startsWith('/api/dev/yahoo-company')) {
          next()
          return
        }
        if (req.method !== 'GET') {
          next()
          return
        }

        try {
          const url = new URL(req.url, 'http://localhost')
          const sym = url.searchParams.get('symbol')?.trim().toUpperCase()
          if (!sym) {
            res.statusCode = 400
            res.setHeader('Content-Type', 'application/json')
            res.end(JSON.stringify({ error: 'Missing symbol query param', code: 'BAD_REQUEST' }))
            return
          }

          const now = Date.now()
          const hit = cache.get(sym)
          if (hit && hit.expires > now) {
            res.statusCode = 200
            res.setHeader('Content-Type', 'application/json')
            res.end(hit.json)
            return
          }

          const [{ default: yahooFinance }, { mapQuoteSummaryToCompanyRawPack }] = await Promise.all([
            import('yahoo-finance2'),
            import('./src/lib/yahoo/mapQuoteSummaryToCompanyRawPack.ts'),
          ])
          try {
            yahooFinance.suppressNotices(['yahooSurvey'])
          } catch {
            /* ignore */
          }

          const modules = [
            'price',
            'summaryProfile',
            'summaryDetail',
            'defaultKeyStatistics',
            'financialData',
            'incomeStatementHistory',
            'incomeStatementHistoryQuarterly',
            'cashflowStatementHistory',
            'cashflowStatementHistoryQuarterly',
            'balanceSheetHistory',
            'earningsTrend',
          ] as const

          let summary: Awaited<ReturnType<typeof yahooFinance.quoteSummary>> | undefined
          for (let attempt = 0; attempt < RETRY_DELAYS_MS.length; attempt++) {
            const wait = RETRY_DELAYS_MS[attempt]!
            if (wait > 0) await sleep(wait)
            try {
              summary = await yahooFinance.quoteSummary(sym, { modules: [...modules] })
              break
            } catch (e) {
              const msg = e instanceof Error ? e.message : String(e)
              const canRetry = attempt < RETRY_DELAYS_MS.length - 1 && isRetryableYahooFailure(msg)
              if (!canRetry) throw e
            }
          }
          if (summary === undefined) {
            throw new Error('Yahoo quoteSummary returned no data after retries')
          }

          const pack = mapQuoteSummaryToCompanyRawPack(sym, summary)
          const json = JSON.stringify(pack)
          cache.set(sym, { expires: now + CACHE_MS, json })

          res.statusCode = 200
          res.setHeader('Content-Type', 'application/json')
          res.end(json)
        } catch (e) {
          const { status, payload } = publicYahooError(e)
          res.statusCode = status
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(payload))
        }
      })
    },
  }
}
