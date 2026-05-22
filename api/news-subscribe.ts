/**
 * Self-contained Vercel route (do not import from src/ — not bundled per deploy).
 */
import { randomBytes } from 'node:crypto'
import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { VercelRequest, VercelResponse } from '@vercel/node'

const RESEND_API = 'https://api.resend.com/emails'
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

interface ResendNewsConfig {
  apiKey: string
  senderEmail: string
  senderName: string
  appUrl: string
}

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

function resendConfigFromEnv(): ResendNewsConfig | null {
  const apiKey = (process.env.RESEND_KEY ?? '').trim()
  const senderEmail = (process.env.RESEND_SENDER_EMAIL ?? '').trim()
  const rawUrl =
    (process.env.PUBLIC_APP_URL ?? '').trim() ||
    (process.env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim() ||
    (process.env.VERCEL_URL ?? '').trim()
  if (!apiKey || !senderEmail || !rawUrl) return null
  const appUrl = rawUrl.startsWith('http') ? rawUrl.replace(/\/$/, '') : `https://${rawUrl.replace(/\/$/, '')}`
  return {
    apiKey,
    senderEmail,
    senderName: (process.env.RESEND_SENDER_NAME ?? 'StockMoat').trim() || 'StockMoat',
    appUrl,
  }
}

function newEmailToken(): string {
  return randomBytes(24).toString('hex')
}

function normalizeSubscriberEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null
  return e
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatFrom(name: string, email: string): string {
  const n = name.trim()
  const e = email.trim()
  return n ? `${n} <${e}>` : e
}

async function sendResendEmail(cfg: ResendNewsConfig, to: string, subject: string, html: string, text: string): Promise<void> {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${cfg.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'StockMoat/1.0',
    },
    body: JSON.stringify({
      from: formatFrom(cfg.senderName, cfg.senderEmail),
      to: [to],
      subject,
      html,
      text,
    }),
  })
  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend (${res.status}): ${body.slice(0, 300)}`)
  }
}

async function requestNewsSubscription(
  sb: SupabaseClient,
  rawEmail: string,
  cfg: ResendNewsConfig,
): Promise<{ ok: boolean; message: string }> {
  const email = normalizeSubscriberEmail(rawEmail)
  if (!email) return { ok: false, message: 'Please enter a valid email address.' }

  const confirmToken = newEmailToken()
  const unsubscribeToken = newEmailToken()
  const now = new Date().toISOString()

  const { data: existing, error: fetchErr } = await sb
    .from('news_subscribers')
    .select('id, status')
    .eq('email', email)
    .maybeSingle()
  if (fetchErr) return { ok: false, message: 'Could not process subscription. Try again later.' }

  if (existing?.status === 'active') {
    return { ok: true, message: 'This email is already subscribed. Check your inbox for past digests.' }
  }

  if (existing) {
    const { error: updErr } = await sb
      .from('news_subscribers')
      .update({
        status: 'pending',
        confirm_token: confirmToken,
        unsubscribe_token: unsubscribeToken,
        confirmed_at: null,
        updated_at: now,
      })
      .eq('email', email)
    if (updErr) return { ok: false, message: 'Could not process subscription. Try again later.' }
  } else {
    const { error: insErr } = await sb.from('news_subscribers').insert({
      email,
      status: 'pending',
      confirm_token: confirmToken,
      unsubscribe_token: unsubscribeToken,
    })
    if (insErr) return { ok: false, message: 'Could not process subscription. Try again later.' }
  }

  const confirmUrl = `${cfg.appUrl}/api/news-subscribe?action=confirm&token=${encodeURIComponent(confirmToken)}`
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;">
<p>Confirm your subscription to <strong>StockMoat material news</strong> (hourly digest when new high-impact events are published).</p>
<p><a href="${escapeHtml(confirmUrl)}">Confirm subscription</a></p>
<p style="font-size:12px;color:#94a3b8;">If you did not request this, ignore this email.</p>
</body></html>`

  try {
    await sendResendEmail(
      cfg,
      email,
      'Confirm your StockMoat news subscription',
      html,
      `Confirm your StockMoat news subscription:\n${confirmUrl}`,
    )
  } catch {
    return { ok: false, message: 'Could not send confirmation email. Try again later.' }
  }

  return { ok: true, message: 'Check your inbox to confirm your subscription.' }
}

async function confirmNewsSubscription(sb: SupabaseClient, token: string): Promise<{ ok: boolean; message: string }> {
  const t = token.trim()
  if (!t) return { ok: false, message: 'Invalid confirmation link.' }

  const { data, error } = await sb
    .from('news_subscribers')
    .select('status')
    .eq('confirm_token', t)
    .maybeSingle()
  if (error || !data) return { ok: false, message: 'Invalid or expired confirmation link.' }
  if (data.status === 'active') {
    return { ok: true, message: 'Already confirmed.' }
  }

  const { error: updErr } = await sb
    .from('news_subscribers')
    .update({
      status: 'active',
      confirmed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('confirm_token', t)
  if (updErr) return { ok: false, message: 'Could not confirm subscription.' }
  return { ok: true, message: 'Subscription confirmed.' }
}

async function unsubscribeNews(sb: SupabaseClient, token: string): Promise<{ ok: boolean; message: string }> {
  const t = token.trim()
  if (!t) return { ok: false, message: 'Invalid unsubscribe link.' }
  const { error } = await sb
    .from('news_subscribers')
    .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', t)
  if (error) return { ok: false, message: 'Could not unsubscribe.' }
  return { ok: true, message: 'You have been unsubscribed.' }
}

function redirectToNews(res: VercelResponse, query: string, cfg: ResendNewsConfig | null): void {
  const base = cfg?.appUrl ?? ''
  const path = base ? `${base}/news` : '/news'
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
    res.status(500).json({ error: 'Server not configured (Supabase).' })
    return
  }

  const resend = resendConfigFromEnv()
  if (!resend) {
    res.status(503).json({
      error: 'Email service not configured. Set RESEND_KEY and RESEND_SENDER_EMAIL on Vercel.',
    })
    return
  }

  if (req.method === 'GET') {
    const action = typeof req.query.action === 'string' ? req.query.action : ''
    const token = typeof req.query.token === 'string' ? req.query.token : ''
    if (action === 'confirm') {
      const out = await confirmNewsSubscription(sb, token)
      redirectToNews(res, out.ok ? 'subscribed=confirmed' : 'subscribed=error', resend)
      return
    }
    if (action === 'unsubscribe') {
      const out = await unsubscribeNews(sb, token)
      redirectToNews(res, out.ok ? 'subscribed=unsubscribed' : 'subscribed=error', resend)
      return
    }
    res.status(400).json({ error: 'Invalid action' })
    return
  }

  if (req.method === 'POST') {
    const body = req.body as { email?: unknown }
    const email = typeof body?.email === 'string' ? body.email : ''
    const out = await requestNewsSubscription(sb, email, resend)
    res.status(out.ok ? 200 : 400).json({ ok: out.ok, message: out.message })
    return
  }

  res.status(405).json({ error: 'Method not allowed' })
}
