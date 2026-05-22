const RESEND_API = 'https://api.resend.com/emails'

export interface ResendSender {
  email: string
  name: string
}

function formatFrom(sender: ResendSender): string {
  const name = sender.name.trim()
  const email = sender.email.trim()
  return name ? `${name} <${email}>` : email
}

export async function sendResendEmail(params: {
  apiKey: string
  sender: ResendSender
  to: string
  subject: string
  html: string
  text?: string
}): Promise<void> {
  const res = await fetch(RESEND_API, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.apiKey}`,
      'Content-Type': 'application/json',
      'User-Agent': 'StockMoat/1.0',
    },
    body: JSON.stringify({
      from: formatFrom(params.sender),
      to: [params.to],
      subject: params.subject,
      html: params.html,
      text: params.text,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Resend send failed (${res.status}): ${body.slice(0, 400)}`)
  }
}
