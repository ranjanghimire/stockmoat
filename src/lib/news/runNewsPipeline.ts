import type { SupabaseClient } from '@supabase/supabase-js'
import { isNearDuplicateTitle } from './dedupe'
import { fetchFmpNewsForSymbol } from './fetchFmpNews'
import { DEFAULT_GEMINI_NEWS_MODEL, scoreNewsCandidatesWithGemini } from './geminiScore'
import { allAnchorSymbols, lanesBySymbol, loadNewsAnchors } from './loadNewsAnchors'
import { shouldRejectCandidate } from './prefilter'
import { fetchRecent8KCandidates } from './sec8k/fetchRecent8K'
import type { ResendNewsConfig } from './resendConfig'
import { sendMaterialNewsDigest } from './digestEmail'
import type { MaterialNewsInsert, NewsCandidate } from './types'

export interface NewsPipelineEnv {
  fmpApiKey: string
  geminiApiKey: string
  geminiModel?: string
  secUserAgent?: string
  fmpGapMs?: number
  secGapMs?: number
  geminiBatchSize?: number
  maxAgeHours?: number
  resend?: ResendNewsConfig | null
}

export interface NewsPipelineResult {
  fmpFetched: number
  secFetched: number
  prefilterRejected: number
  deduped: number
  geminiScored: number
  published: number
  skippedCap: number
  digestEmailsSent: number
  digestEmailsFailed: number
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}

async function loadSeenFingerprints(sb: SupabaseClient): Promise<Set<string>> {
  const seen = new Set<string>()
  const pageSize = 1000
  for (let from = 0; ; from += pageSize) {
    const { data, error } = await sb.from('news_seen_candidates').select('fingerprint').range(from, from + pageSize - 1)
    if (error) throw new Error(`news_seen_candidates: ${error.message}`)
    for (const row of data ?? []) {
      if (typeof row.fingerprint === 'string') seen.add(row.fingerprint)
    }
    if ((data ?? []).length < pageSize) break
  }
  return seen
}

async function loadRecentHeadlines(sb: SupabaseClient, hours = 48): Promise<string[]> {
  const since = new Date(Date.now() - hours * 3600 * 1000).toISOString()
  const { data, error } = await sb
    .from('material_news')
    .select('headline')
    .gte('published_at', since)
    .order('published_at', { ascending: false })
    .limit(80)
  if (error) throw new Error(`material_news headlines: ${error.message}`)
  return (data ?? []).map((r) => (typeof r.headline === 'string' ? r.headline : '')).filter(Boolean)
}

async function loadPublishCounts24h(sb: SupabaseClient): Promise<{ global: number; byLane: Map<string, number> }> {
  const since = new Date(Date.now() - 24 * 3600 * 1000).toISOString()
  const { data, error } = await sb.from('material_news').select('lane_ids').gte('published_at', since)
  if (error) throw new Error(`material_news counts: ${error.message}`)
  const byLane = new Map<string, number>()
  for (const row of data ?? []) {
    const lanes = Array.isArray(row.lane_ids) ? row.lane_ids : []
    for (const lid of lanes) {
      if (typeof lid !== 'string') continue
      byLane.set(lid, (byLane.get(lid) ?? 0) + 1)
    }
  }
  return { global: (data ?? []).length, byLane }
}

async function loadSecAccessionSet(sb: SupabaseClient): Promise<Set<string>> {
  const { data, error } = await sb.from('news_pipeline_state').select('sec_accessions').eq('id', 'main').maybeSingle()
  if (error) throw new Error(`news_pipeline_state: ${error.message}`)
  const raw = data?.sec_accessions
  if (!raw || typeof raw !== 'object') return new Set()
  const set = new Set<string>()
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v) set.add(k)
  }
  return set
}

async function saveSecAccessions(sb: SupabaseClient, existing: Set<string>, added: string[]): Promise<void> {
  const obj: Record<string, boolean> = {}
  for (const a of existing) obj[a] = true
  for (const a of added) obj[a] = true
  const keys = Object.keys(obj)
  const trimmed =
    keys.length > 5000 ? Object.fromEntries(keys.slice(-4000).map((k) => [k, true])) : obj
  const { error } = await sb.from('news_pipeline_state').upsert({
    id: 'main',
    sec_accessions: trimmed,
    last_run_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  })
  if (error) throw new Error(`news_pipeline_state upsert: ${error.message}`)
}

function dedupeCandidatesByFingerprint(candidates: NewsCandidate[]): NewsCandidate[] {
  const byFp = new Map<string, NewsCandidate>()
  for (const c of candidates) {
    if (!byFp.has(c.fingerprint)) byFp.set(c.fingerprint, c)
  }
  return [...byFp.values()]
}

async function markSeen(sb: SupabaseClient, candidates: NewsCandidate[]): Promise<void> {
  const unique = dedupeCandidatesByFingerprint(candidates)
  if (unique.length === 0) return
  const seenAt = new Date().toISOString()
  const rows = unique.map((c) => ({
    fingerprint: c.fingerprint,
    source_url: c.sourceUrl,
    seen_at: seenAt,
  }))
  const { error } = await sb.from('news_seen_candidates').upsert(rows, { onConflict: 'fingerprint' })
  if (error) throw new Error(`news_seen_candidates upsert: ${error.message}`)
}

function canPublishLane(
  laneIds: string[],
  counts: { global: number; byLane: Map<string, number> },
  cfg: { global_max_per_24h: number; per_lane_max_per_24h: number },
): boolean {
  if (counts.global >= cfg.global_max_per_24h) return false
  for (const lid of laneIds) {
    if ((counts.byLane.get(lid) ?? 0) >= cfg.per_lane_max_per_24h) return false
  }
  return true
}

function bumpPublishCounts(laneIds: string[], counts: { global: number; byLane: Map<string, number> }): void {
  counts.global += 1
  for (const lid of laneIds) {
    counts.byLane.set(lid, (counts.byLane.get(lid) ?? 0) + 1)
  }
}

export async function runNewsPipeline(sb: SupabaseClient, env: NewsPipelineEnv): Promise<NewsPipelineResult> {
  const anchors = loadNewsAnchors()
  const symbols = allAnchorSymbols(anchors)
  const symLanes = lanesBySymbol(anchors)
  const fmpGap = env.fmpGapMs ?? 400
  const secGap = env.secGapMs ?? 280
  const batchSize = env.geminiBatchSize ?? 8
  const maxAgeHours = env.maxAgeHours ?? 96
  const model = env.geminiModel?.trim() || DEFAULT_GEMINI_NEWS_MODEL
  const threshold = anchors.publish.impact_threshold

  const result: NewsPipelineResult = {
    fmpFetched: 0,
    secFetched: 0,
    prefilterRejected: 0,
    deduped: 0,
    geminiScored: 0,
    published: 0,
    skippedCap: 0,
    digestEmailsSent: 0,
    digestEmailsFailed: 0,
  }

  const publishedThisRun: MaterialNewsInsert[] = []

  const seen = await loadSeenFingerprints(sb)
  const recentHeadlines = await loadRecentHeadlines(sb)
  const publishCounts = await loadPublishCounts24h(sb)
  const secKnown = await loadSecAccessionSet(sb)

  const rawCandidates: NewsCandidate[] = []

  for (const sym of symbols) {
    const laneIds = symLanes.get(sym) ?? []
    const fmpRows = await fetchFmpNewsForSymbol(sym, env.fmpApiKey, laneIds)
    result.fmpFetched += fmpRows.length
    rawCandidates.push(...fmpRows)
    await sleep(fmpGap)
  }

  const secOut = await fetchRecent8KCandidates(symbols, symLanes, secKnown, {
    userAgent: env.secUserAgent,
    lookbackDays: 14,
    maxPerSymbol: 4,
    gapMs: secGap,
  })
  result.secFetched = secOut.candidates.length
  rawCandidates.push(...secOut.candidates)

  const filtered: NewsCandidate[] = []
  const filteredFp = new Set<string>()
  for (const c of rawCandidates) {
    const reject = shouldRejectCandidate(c.headline, c.excerpt, c.publishedAt, maxAgeHours)
    if (reject) {
      result.prefilterRejected++
      continue
    }
    if (seen.has(c.fingerprint) || filteredFp.has(c.fingerprint)) {
      result.deduped++
      continue
    }
    let dupTitle = false
    for (const h of recentHeadlines) {
      if (isNearDuplicateTitle(c.headline, h)) {
        dupTitle = true
        break
      }
      for (const f of filtered) {
        if (isNearDuplicateTitle(c.headline, f.headline)) {
          dupTitle = true
          break
        }
      }
      if (dupTitle) break
    }
    if (dupTitle) {
      result.deduped++
      continue
    }
    filteredFp.add(c.fingerprint)
    filtered.push(c)
  }

  filtered.sort((a, b) => b.publishedAt.getTime() - a.publishedAt.getTime())
  const toScore = filtered.slice(0, 60)

  for (let i = 0; i < toScore.length; i += batchSize) {
    const batch = toScore.slice(i, i + batchSize)
    const scores = await scoreNewsCandidatesWithGemini(batch, env.geminiApiKey, model)
    result.geminiScored += batch.length

    const publishedRows: MaterialNewsInsert[] = []
    const publishedCandidates: NewsCandidate[] = []

    for (let j = 0; j < batch.length; j++) {
      const c = batch[j]
      const s = scores[j]
      if (!s.publish || s.impact_score < threshold) continue

      const laneIds = s.lane_ids.length > 0 ? s.lane_ids : c.laneIds
      if (!canPublishLane(laneIds, publishCounts, anchors.publish)) {
        result.skippedCap++
        continue
      }

      publishedRows.push({
        published_at: c.publishedAt.toISOString(),
        headline: s.headline_display,
        summary: s.why_material,
        impact_score: s.impact_score,
        category: s.category,
        lane_ids: laneIds,
        tickers: s.tickers,
        source_type: c.sourceType,
        source_url: c.sourceUrl,
        anchor_symbol: c.anchorSymbol,
        raw_excerpt: c.excerpt.slice(0, 4000),
        sec_items: c.secItems ?? null,
        gemini_model: model,
      })
      publishedCandidates.push(c)
      recentHeadlines.push(s.headline_display)
      bumpPublishCounts(laneIds, publishCounts)
    }

    if (publishedRows.length > 0) {
      const { error } = await sb.from('material_news').upsert(publishedRows, { onConflict: 'source_url' })
      if (error) throw new Error(`material_news upsert: ${error.message}`)
      result.published += publishedRows.length
      publishedThisRun.push(...publishedRows)
    }

    await markSeen(sb, batch)
    await sleep(600)
  }

  const scoredFp = new Set(toScore.map((c) => c.fingerprint))
  await markSeen(sb, filtered.filter((c) => !scoredFp.has(c.fingerprint)))
  await saveSecAccessions(sb, secKnown, secOut.newAccessions)

  const { error: statsErr } = await sb
    .from('news_pipeline_state')
    .update({ last_stats: result, last_run_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq('id', 'main')
  if (statsErr) console.warn('news_pipeline_state stats:', statsErr.message)

  if (result.published > 0 && env.resend) {
    try {
      const digest = await sendMaterialNewsDigest(sb, publishedThisRun, env.resend)
      result.digestEmailsSent = digest.sent
      result.digestEmailsFailed = digest.failed
    } catch (e) {
      console.warn('Material news digest email:', e instanceof Error ? e.message : e)
    }
  }

  return result
}
