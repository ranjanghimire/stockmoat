/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FMP_API_KEY: string
  readonly VITE_USE_YAHOO?: string
  readonly VITE_FMP_FETCH_PEERS?: string
  readonly VITE_SUPABASE_URL?: string
  readonly VITE_SUPABASE_ANON_KEY?: string
  /** Optional: deployed origin for admin API when local Vite cannot reach /api (e.g. https://myapp.vercel.app). */
  readonly VITE_ADMIN_MOAT_API_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.yaml?raw' {
  const src: string
  export default src
}
