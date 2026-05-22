import type { SupabaseClient } from '@supabase/supabase-js'
import { sendResendEmail } from '../email/resend'
import type { ResendNewsConfig } from './resendConfig'
import { escapeHtml, newEmailToken, normalizeSubscriberEmail } from './emailTokens'

export type SubscribeResult =
  | { ok: true; message: string }
  | { ok: false; message: string }

export async function requestNewsSubscription(
  sb: SupabaseClient,
  rawEmail: string,
  resend: ResendNewsConfig,
): Promise<SubscribeResult> {
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

  const confirmUrl = `${resend.appUrl}/api/news-subscribe?action=confirm&token=${encodeURIComponent(confirmToken)}`
  const html = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;">
<p>Confirm your subscription to <strong>StockMoat material news</strong> (hourly digest when new high-impact events are published).</p>
<p><a href="${escapeHtml(confirmUrl)}">Confirm subscription</a></p>
<p style="font-size:12px;color:#94a3b8;">If you did not request this, ignore this email.</p>
</body></html>`

  try {
    await sendResendEmail({
      apiKey: resend.apiKey,
      sender: { email: resend.senderEmail, name: resend.senderName },
      to: email,
      subject: 'Confirm your StockMoat news subscription',
      html,
      text: `Confirm your StockMoat news subscription:\n${confirmUrl}`,
    })
  } catch {
    return { ok: false, message: 'Could not send confirmation email. Try again later.' }
  }

  return { ok: true, message: 'Check your inbox to confirm your subscription.' }
}

export async function confirmNewsSubscription(
  sb: SupabaseClient,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const t = token.trim()
  if (!t) return { ok: false, message: 'Invalid confirmation link.' }

  const { data, error } = await sb
    .from('news_subscribers')
    .select('email, status')
    .eq('confirm_token', t)
    .maybeSingle()
  if (error || !data) return { ok: false, message: 'Invalid or expired confirmation link.' }

  if (data.status === 'active') {
    return { ok: true, message: 'Already confirmed. You will receive hourly digests when new material news is published.' }
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

  return { ok: true, message: 'Subscription confirmed. You will receive hourly digests when new material news is published.' }
}

export async function unsubscribeNews(
  sb: SupabaseClient,
  token: string,
): Promise<{ ok: boolean; message: string }> {
  const t = token.trim()
  if (!t) return { ok: false, message: 'Invalid unsubscribe link.' }

  const { error } = await sb
    .from('news_subscribers')
    .update({ status: 'unsubscribed', updated_at: new Date().toISOString() })
    .eq('unsubscribe_token', t)
  if (error) return { ok: false, message: 'Could not unsubscribe.' }

  return { ok: true, message: 'You have been unsubscribed from material news emails.' }
}
