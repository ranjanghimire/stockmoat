import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import type { Plugin } from 'vite'
import { defineConfig, loadEnv } from 'vite'

function yahooDevCompanyPlugin(): Plugin {
  return {
    name: 'yahoo-dev-company-api',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
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
            res.end(JSON.stringify({ error: 'Missing symbol query param' }))
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
          const summary = await yahooFinance.quoteSummary(sym, {
            modules: [
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
            ],
          })
          const pack = mapQuoteSummaryToCompanyRawPack(sym, summary)
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify(pack))
        } catch (e) {
          res.statusCode = 502
          res.setHeader('Content-Type', 'application/json')
          res.end(JSON.stringify({ error: e instanceof Error ? e.message : String(e) }))
        }
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const fmpKey = env.fmpApiKey ?? env.VITE_FMP_API_KEY ?? ''
  return {
    plugins: [react(), tailwindcss(), yahooDevCompanyPlugin()],
    define: {
      'import.meta.env.FMP_API_KEY': JSON.stringify(fmpKey),
    },
  }
})
