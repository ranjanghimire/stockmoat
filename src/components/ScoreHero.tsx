interface ScoreHeroProps {
  score: number
  ticker: string
  name: string
  profileLabel: string
  anyGateFail: boolean
  scoreCap: number
  dataSource?: 'fmp' | 'demo' | 'yahoo_dev'
  sector?: string
  industry?: string
}

function dataSourceLabel(ds: string | undefined): string {
  if (ds === 'fmp') return 'Financial Modeling Prep (live)'
  if (ds === 'yahoo_dev') return 'Yahoo Finance (dev — one server call, no peer medians)'
  return 'demo / offline'
}

export function ScoreHero({
  score,
  ticker,
  name,
  profileLabel,
  anyGateFail,
  scoreCap,
  dataSource = 'demo',
  sector,
  industry,
}: ScoreHeroProps) {
  const hue = Math.round(120 - (score / 10) * 70)
  return (
    <div className="relative overflow-hidden rounded-2xl border border-white/60 bg-white/80 p-8 shadow-xl shadow-slate-900/5 backdrop-blur-md">
      <div
        className="pointer-events-none absolute -right-20 -top-20 h-64 w-64 rounded-full opacity-30 blur-3xl"
        style={{ background: `hsl(${hue} 45% 70%)` }}
      />
      <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-slate-500">Value moat score</p>
          <h2 className="mt-1 font-display text-4xl text-moat-ink md:text-5xl">
            {ticker}
            <span className="ml-3 text-2xl font-sans font-medium text-slate-500 md:text-3xl">{name}</span>
          </h2>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-slate-600">
            Sector profile: <span className="font-medium text-moat-ink">{profileLabel}</span>. Data:{' '}
            <span className="font-medium text-moat-ink">{dataSourceLabel(dataSource)}</span>
            {sector ? (
              <>
                {' '}
                · Sector <span className="font-medium text-moat-ink">{sector}</span>
                {industry ? (
                  <>
                    {' '}
                    / <span className="font-medium text-moat-ink">{industry}</span>
                  </>
                ) : null}
              </>
            ) : null}
            . Weights come from <span className="font-medium">config/sector_profiles.v1.yaml</span>.
          </p>
        </div>
        <div className="flex flex-col items-start gap-2 md:items-end">
          <div
            className="flex h-28 w-28 items-center justify-center rounded-full border-4 border-white shadow-inner"
            style={{
              background: `conic-gradient(hsl(${hue} 42% 42%) ${score * 36}deg, #e2e8f0 0)`,
            }}
            aria-label={`Moat score ${score} out of ten`}
          >
            <div className="flex h-20 w-20 flex-col items-center justify-center rounded-full bg-white">
              <span className="font-display text-4xl leading-none text-moat-ink">{score}</span>
              <span className="text-[10px] font-semibold uppercase tracking-widest text-slate-400">/ 10</span>
            </div>
          </div>
          {anyGateFail ? (
            <p className="max-w-xs text-right text-xs text-amber-800">
              A hard <span className="font-semibold">gate</span> failed; score capped at {scoreCap} per config.
            </p>
          ) : (
            <p className="text-right text-xs text-slate-500">No hard gate failures.</p>
          )}
        </div>
      </div>
    </div>
  )
}
