import { isMaterial8KItemCode, ROUTINE_8K_ITEM_CODES } from './materialItems'

export interface Parsed8KItem {
  code: string
  title: string
  body: string
}

export interface Parsed8KFiling {
  items: Parsed8KItem[]
  plainText: string
}

const ITEM_HEADING_RE =
  /(?:^|[\n\r]|\.)\s*item\s+(\d+\.\d+)\s*[-–—.:]?\s*([^\n\r]{0,120})/gim

function stripHtml(html: string): string {
  let t = html
  t = t.replace(/<script[\s\S]*?<\/script>/gi, '\n')
  t = t.replace(/<style[\s\S]*?<\/style>/gi, '\n')
  t = t.replace(/<br\s*\/?>/gi, '\n')
  t = t.replace(/<\/p>/gi, '\n')
  t = t.replace(/<\/div>/gi, '\n')
  t = t.replace(/<\/h[1-6]>/gi, '\n')
  t = t.replace(/<[^>]+>/g, ' ')
  t = t
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
  return t
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n/g, '\n')
    .trim()
}

/** Split filing HTML/text into Item sections. */
export function parse8kDocument(htmlOrText: string): Parsed8KFiling {
  const plain = stripHtml(htmlOrText)
  const items: Parsed8KItem[] = []
  const matches: { code: string; title: string; index: number }[] = []

  let m: RegExpExecArray | null
  const re = new RegExp(ITEM_HEADING_RE.source, ITEM_HEADING_RE.flags)
  while ((m = re.exec(plain)) !== null) {
    const code = m[1]?.trim()
    if (!code) continue
    matches.push({
      code,
      title: (m[2] ?? '').trim().slice(0, 120),
      index: m.index,
    })
  }

  for (let i = 0; i < matches.length; i++) {
    const cur = matches[i]
    const next = matches[i + 1]
    const start = cur.index
    const end = next ? next.index : plain.length
    let body = plain.slice(start, end).trim()
    body = body.replace(/^item\s+\d+\.\d+[^\n]*\n?/i, '').trim()
    if (ROUTINE_8K_ITEM_CODES.has(cur.code)) continue
    if (!isMaterial8KItemCode(cur.code) && cur.code !== '8.01') continue
    items.push({
      code: cur.code,
      title: cur.title || `Item ${cur.code}`,
      body: body.slice(0, 6000),
    })
  }

  return { items, plainText: plain.slice(0, 12000) }
}

export function build8kHeadline(symbol: string, items: Parsed8KItem[]): string {
  if (items.length === 0) return `${symbol} filed Form 8-K`
  const first = items[0]
  const label = first.title ? `Item ${first.code}: ${first.title}` : `Item ${first.code}`
  if (items.length === 1) return `${symbol} 8-K — ${label}`
  return `${symbol} 8-K — ${label} (+${items.length - 1} more items)`
}

export function build8kExcerpt(items: Parsed8KItem[], plainText: string): string {
  const parts = items.map((it) => `Item ${it.code}: ${it.body.slice(0, 800)}`)
  if (parts.length > 0) return parts.join('\n\n').slice(0, 4000)
  return plainText.slice(0, 4000)
}
