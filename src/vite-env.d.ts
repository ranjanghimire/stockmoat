/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FMP_API_KEY: string
  readonly VITE_USE_YAHOO?: string
  readonly VITE_FMP_FETCH_PEERS?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.yaml?raw' {
  const src: string
  export default src
}
