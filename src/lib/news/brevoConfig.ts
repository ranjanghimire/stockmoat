export interface BrevoNewsConfig {
  apiKey: string
  senderEmail: string
  senderName: string
  appUrl: string
}

export function brevoConfigFromEnv(env: NodeJS.ProcessEnv = process.env): BrevoNewsConfig | null {
  const apiKey = (env.BREVO_KEY ?? '').trim()
  const senderEmail = (env.BREVO_SENDER_EMAIL ?? '').trim()
  const appUrl = (env.PUBLIC_APP_URL ?? env.VITE_PUBLIC_APP_URL ?? env.VERCEL_URL ?? '').trim()
  if (!apiKey || !senderEmail) return null
  const baseUrl = appUrl.startsWith('http') ? appUrl.replace(/\/$/, '') : appUrl ? `https://${appUrl}` : ''
  if (!baseUrl) return null
  return {
    apiKey,
    senderEmail,
    senderName: (env.BREVO_SENDER_NAME ?? 'StockMoat').trim() || 'StockMoat',
    appUrl: baseUrl,
  }
}
