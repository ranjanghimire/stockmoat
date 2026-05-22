import { createHash, timingSafeEqual } from 'node:crypto'
import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { brevoConfigFromEnv } from '../src/lib/news/brevoConfig'
import { runNewsPipeline } from '../src/lib/news/runNewsPipeline'

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, x-news-secret')
}

function checkSecret(provided: unknown, expected: string): boolean {
  if (typeof provided !== 'string' || !expected) return false
  const a = createHash('sha256').update(provided, 'utf8').digest()
  const b = createHash('sha256').update(expected, 'utf8').digest()
  return a.length === b.length && timingSafeEqual(a, b)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' })
    return
  }

  const secret = process.env.NEWS_PIPELINE_SECRET ?? ''
  const header = req.headers['x-news-secret']
  const bodySecret = typeof req.body === 'object' && req.body && 'secret' in req.body ? req.body.secret : undefined
  if (!secret || (!checkSecret(header, secret) && !checkSecret(bodySecret, secret))) {
    res.status(401).json({ error: 'Unauthorized' })
    return
  }

  const fmpKey = process.env.FMP_API_KEY ?? process.env.fmpApiKey ?? ''
  const geminiKey = process.env.GEMINI_API_KEY ?? ''
  const supabaseUrl = process.env.SUPABASE_URL ?? ''
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''

  if (!fmpKey || !geminiKey || !supabaseUrl || !serviceKey) {
    res.status(500).json({ error: 'Server missing required env vars' })
    return
  }

  try {
    const sb = createClient(supabaseUrl, serviceKey)
    const stats = await runNewsPipeline(sb, {
      fmpApiKey: fmpKey,
      geminiApiKey: geminiKey,
      geminiModel: process.env.GEMINI_MODEL,
      secUserAgent: process.env.SEC_USER_AGENT,
      brevo: brevoConfigFromEnv(process.env),
    })
    res.status(200).json({ ok: true, stats })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    res.status(500).json({ error: msg })
  }
}
