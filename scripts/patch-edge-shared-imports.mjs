/**
 * Supabase Edge bundler requires explicit `.ts` on relative imports.
 * Run after `cp` in `npm run sync:edge-fmp-shared` so copies from `src/lib/fmp` get patched.
 */
import fs from 'node:fs'
import path from 'node:path'

const dir = path.join('supabase', 'functions', 'home-fmp-cache', '_shared')

for (const name of fs.readdirSync(dir)) {
  if (!name.endsWith('.ts')) continue
  const fp = path.join(dir, name)
  let s = fs.readFileSync(fp, 'utf8')
  s = s.replace(/from '(\.\/[^']+?)'/g, (full, spec) => {
    if (spec.endsWith('.ts')) return full
    return `from '${spec}.ts'`
  })
  fs.writeFileSync(fp, s)
}

console.log('patched', dir)
