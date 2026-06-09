#!/usr/bin/env bun
/**
 * check-i18n-coverage.ts — Verify every literal t('key') callsite resolves in en.json.
 *
 * Scans all .ts / .tsx / .js / .jsx source files (excluding node_modules,
 * dist, test fixtures, locale files themselves) for literal i18n key
 * references and checks that each exists in en.json.
 *
 * Dynamic keys — t(`prefix.${var}`) — are skipped because they can't be
 * statically resolved; they surface via i18next's runtime missing-key
 * warnings instead.
 *
 * Exits 0 when all literal keys resolve; 1 with a diagnostic otherwise.
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { resolve, join } from 'node:path'

const ROOT = resolve(import.meta.dir ?? new URL('.', import.meta.url).pathname, '..')

const EN_JSON_PATH = resolve(ROOT, 'packages', 'shared', 'src', 'i18n', 'locales', 'en.json')
const en = JSON.parse(readFileSync(EN_JSON_PATH, 'utf-8')) as Record<string, string>
const enKeys = new Set(Object.keys(en))

const SKIP_DIRS = new Set([
  'node_modules', 'dist', '.git', 'build', 'coverage',
  'locales', '__tests__', '__mocks__',
])

const SKIP_FILE_RE = /\.(test|spec)\.(tsx?|jsx?)$/

/** Walk directory tree, returning .ts/.tsx files. */
function walk(dir: string): string[] {
  const results: string[] = []
  for (const entry of readdirSync(dir)) {
    if (SKIP_DIRS.has(entry)) continue
    const full = join(dir, entry)
    const stat = statSync(full)
    if (stat.isDirectory()) {
      results.push(...walk(full))
    } else if (/\.(tsx?|jsx?)$/.test(entry) && !entry.endsWith('.d.ts') && !SKIP_FILE_RE.test(entry)) {
      results.push(full)
    }
  }
  return results
}

// Patterns that capture literal key strings:
//   t('some.key')  t("some.key")
//   i18n.t('some.key')
//   i18nT('some.key')
//   <Trans i18nKey="some.key">
// Uses non-word-char lookbehind so t() inside start(), i18nT(), etc. don't match.
const LITERAL_KEY_RE =
  /(?:(?:^|[^a-zA-Z0-9_$])(?:i18n\.)?t|i18nT)\s*\(\s*['"]([^'"]+)['"]/g
const TRANS_KEY_RE = /i18nKey=["']([^"']+)['"]/g

const missing: Array<{ file: string; key: string }> = []

const SCAN_DIRS = [
  resolve(ROOT, 'apps'),
  resolve(ROOT, 'packages'),
]

for (const dir of SCAN_DIRS) {
  for (const file of walk(dir)) {
    const src = readFileSync(file, 'utf-8')
    for (const re of [LITERAL_KEY_RE, TRANS_KEY_RE]) {
      re.lastIndex = 0
      let m: RegExpExecArray | null
      while ((m = re.exec(src)) !== null) {
        const key = m[1]!
        // Skip dynamic keys (contain ${), interpolation markers, and non-i18n strings
        if (key.includes('${') || key.includes('{{')) continue
        // Real i18n keys: must have a dot, no slashes, no whitespace, at least 2 segments
        if (!key.includes('.') || key.includes('/') || /\s/.test(key)) continue
        const parts = key.split('.')
        if (parts.length < 2 || parts[0] === '' || parts[parts.length - 1] === '') continue
        // Handle plural keys: t('foo.bar') where en.json has 'foo.bar_one' / 'foo.bar_other'
        const pluralExists = enKeys.has(key + '_one') || enKeys.has(key + '_other')
          || enKeys.has(key + '_few') || enKeys.has(key + '_many')
        if (!enKeys.has(key) && !pluralExists) {
          missing.push({ file: file.replace(ROOT + '/', ''), key })
        }
      }
    }
  }
}

if (missing.length === 0) {
  console.log(`i18n coverage OK — all literal keys resolve in en.json`)
  process.exit(0)
}

console.error(`i18n coverage failed: ${missing.length} unresolved key(s)`)
for (const { file, key } of missing.slice(0, 30)) {
  console.error(`  ${file}: "${key}"`)
}
if (missing.length > 30) {
  console.error(`  … and ${missing.length - 30} more`)
}
process.exit(1)
