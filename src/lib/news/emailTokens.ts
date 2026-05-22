import { randomBytes } from 'node:crypto'

export function newEmailToken(): string {
  return randomBytes(24).toString('hex')
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

export function normalizeSubscriberEmail(raw: string): string | null {
  const e = raw.trim().toLowerCase()
  if (!e || e.length > 254 || !EMAIL_RE.test(e)) return null
  return e
}

export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}
