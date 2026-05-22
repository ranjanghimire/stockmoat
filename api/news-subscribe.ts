import { createClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'
import { brevoConfigFromEnv } from '../src/lib/news/brevoConfig'
import { confirmNewsSubscription, requestNewsSubscription, unsubscribeNews } from '../src/lib/news/subscribeFlow'

function cors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
}

function supabaseAdmin() {
  const url = process.env.SUPABASE_URL ?? ''
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
  if (!url || !key) return null
  return createClient(url, key)
}

function redirectToNews(res: VercelResponse, query: string): void {
  const brevo = brevoConfigFromEnv()
  const base = brevo?.appUrl ?? '/'
  const path = base.startsWith('http') ? `${base}/news` : '/news'
  res.redirect(302, `${path}?${query}`)
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  cors(res)
  if (req.method === 'OPTIONS') {
    res.status(204).end()
    return
  }

  const sb = supabaseAdmin()
  if (!sb) {
    res.status(500).json({ error: 'Server not configured' })
    return
  }

  const brevo = brevoConfigFromEnv()
  if (!brevo) {
    res.status(503).json({ error: 'Email service not configured' })
    return
  }

  if (req.method === 'GET') {
    const action = typeof req.query.action === 'string' ? req.query.action : ''
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    if (action === 'confirm') {
      const out = await confirmNewsSubscription(sb, token)
      redirectToNews(res, out.ok ? 'subscribed=confirmed' : 'subscribed=error')
      return
    }
    if (action === 'unsubscribe') {
      const out = await unsubscribeNews(sb, token)
      redirectToNews(res, out.ok ? 'subscribed=unsubscribed' : 'subscribed=error')
      return
    }
    res.status(400).json({ error: 'Invalid action' })
    return
  }

  if (req.method === 'POST') {
    const body = req.body as { email?: unknown }
    const email = typeof body?.email === 'string' ? body.email : ''
    const out = await requestNewsSubscription(sb, email, brevo)
    res.status(out.ok ? 200 : 400).json({ ok: out.ok, message: out.message })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
