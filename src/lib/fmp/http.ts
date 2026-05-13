const FMP_ROOT = 'https://financialmodelingprep.com'

export function getFmpApiKey(): string {
  const key = import.meta.env.FMP_API_KEY
  return typeof key === 'string' ? key.trim() : ''
}

export async function fmpGet<T>(
  pathWithQuery: string,
  apiKey: string,
  options?: { signal?: AbortSignal },
): Promise<T> {
  const sep = pathWithQuery.includes('?') ? '&' : '?'
  const url = `${FMP_ROOT}${pathWithQuery}${sep}apikey=${encodeURIComponent(apiKey)}`
  const res = await fetch(url, { signal: options?.signal })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`FMP request failed (${res.status}) ${pathWithQuery} ${text.slice(0, 200)}`)
  }
  return res.json() as Promise<T>
}
