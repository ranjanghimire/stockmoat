export interface ResendNewsConfig {
  apiKey: string
  senderEmail: string
  senderName: string
  appUrl: string
}

export function resendConfigFromEnv(env: NodeJS.ProcessEnv = process.env): ResendNewsConfig | null {
  const apiKey = (env.RESEND_KEY ?? '').trim()
  const senderEmail = (env.RESEND_SENDER_EMAIL ?? '').trim()
  const rawUrl =
    (env.PUBLIC_APP_URL ?? '').trim() ||
    (env.VITE_PUBLIC_APP_URL ?? '').trim() ||
    (env.VERCEL_PROJECT_PRODUCTION_URL ?? '').trim() ||
    (env.VERCEL_URL ?? '').trim()
  if (!apiKey || !senderEmail || !rawUrl) return null
  const baseUrl = rawUrl.startsWith('http') ? rawUrl.replace(/\/$/, '') : `https://${rawUrl.replace(/\/$/, '')}`
  return {
    apiKey,
    senderEmail,
    senderName: (env.RESEND_SENDER_NAME ?? 'StockMoat').trim() || 'StockMoat',
    appUrl: baseUrl,
  }
}
