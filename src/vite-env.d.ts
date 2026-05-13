/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly FMP_API_KEY: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}

declare module '*.yaml?raw' {
  const src: string
  export default src
}
