import type { SupabaseClient } from '@supabase/supabase-js'
import { sendBrevoEmail } from '../email/brevo'
import type { BrevoNewsConfig } from './brevoConfig'
import { escapeHtml } from './emailTokens'
import type { MaterialNewsInsert } from './types'

export interface DigestSendResult {
  sent: number
  failed: number
  skipped: boolean
}

function buildDigestHtml(items: MaterialNewsInsert[], appUrl: string): string {
  const blocks = items
    .map((item) => {
      const headline = escapeHtml(item.headline)
      const summary = escapeHtml(item.summary)
      const url = escapeHtml(item.source_url)
      const tickers = item.tickers.map((t) => escapeHtml(t)).join(', ')
      return `<li style="margin-bottom:1.25em;">
        <strong><a href="${url}">${headline}</a></strong>
        <div style="color:#475569;font-size:14px;margin:0.35em 0;">${summary}</div>
        <div style="font-size:12px;color:#64748b;">Impact ${item.impact_score}/10 · ${tickers}</div>
      </li>`
    })
    .join('')

  const n = items.length
  const title = n === 1 ? '1 new material event' : `${n} new material events`

  return `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;color:#0f172a;line-height:1.5;">
<p>StockMoat material news — <strong>${title}</strong></p>
<ol style="padding-left:1.25em;">${blocks}</ol>
<p><a href="${escapeHtml(appUrl)}/news">View all on StockMoat</a></p>
<p style="font-size:12px;color:#94a3b8;">Hourly digest. You subscribed on the News page.</p>
</body></html>`
}

function buildDigestText(items: MaterialNewsInsert[], appUrl: string): string {
  const lines = items.map((item, i) => {
    return `${i + 1}. ${item.headline}\n   ${item.summary}\n   ${item.source_url}`
  })
  const n = items.length
  return `StockMoat — ${n} new material event(s)\n\n${lines.join('\n\n')}\n\nView all: ${appUrl}/news`
}

export async function sendMaterialNewsDigest(
  sb: SupabaseClient,
  items: MaterialNewsInsert[],
  brevo: BrevoNewsConfig,
): Promise<DigestSendResult> {
  if (items.length === 0) return { sent: 0, failed: 0, skipped: true }

  const { data: subs, error } = await sb
    .from('news_subscribers')
    .select('email, unsubscribe_token')
    .eq('status', 'active')
  if (error) throw new Error(`news_subscribers list: ${error.message}`)
  if (!subs?.length) return { sent: 0, failed: 0, skipped: true }

  const n = items.length
  const subject = n === 1 ? 'StockMoat: 1 new material event' : `StockMoat: ${n} new material events`
  const htmlContent = buildDigestHtml(items, brevo.appUrl)
  const textContent = buildDigestText(items, brevo.appUrl)
  const sender = { email: brevo.senderEmail, name: brevo.senderName }

  let sent = 0
  let failed = 0

  for (const sub of subs) {
    const email = typeof sub.email === 'string' ? sub.email : ''
    const unsubToken = typeof sub.unsubscribe_token === 'string' ? sub.unsubscribe_token : ''
    if (!email) continue

    const unsubUrl = `${brevo.appUrl}/api/news-subscribe?action=unsubscribe&token=${encodeURIComponent(unsubToken)}`
    const html = `${htmlContent}<p style="font-size:12px;color:#94a3b8;"><a href="${escapeHtml(unsubUrl)}">Unsubscribe</a></p>`

    try {
      await sendBrevoEmail({
        apiKey: brevo.apiKey,
        sender,
        to: [{ email }],
        subject,
        htmlContent: html,
        textContent: `${textContent}\n\nUnsubscribe: ${unsubUrl}`,
      })
      sent++
      await sleep(120)
    } catch (e) {
      failed++
      console.warn(`Digest email failed for ${email}:`, e instanceof Error ? e.message : e)
    }
  }

  return { sent, failed, skipped: false }
}

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms))
}
