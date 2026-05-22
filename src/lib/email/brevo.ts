const BREVO_API = 'https://api.brevo.com/v3/smtp/email'

export interface BrevoSender {
  email: string
  name: string
}

export interface BrevoRecipient {
  email: string
  name?: string
}

export async function sendBrevoEmail(params: {
  apiKey: string
  sender: BrevoSender
  to: BrevoRecipient[]
  subject: string
  htmlContent: string
  textContent?: string
}): Promise<void> {
  const res = await fetch(BREVO_API, {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'content-type': 'application/json',
      'api-key': params.apiKey,
    },
    body: JSON.stringify({
      sender: params.sender,
      to: params.to,
      subject: params.subject,
      htmlContent: params.htmlContent,
      textContent: params.textContent,
    }),
  })

  if (!res.ok) {
    const body = await res.text().catch(() => '')
    throw new Error(`Brevo send failed (${res.status}): ${body.slice(0, 400)}`)
  }
}
