#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
node --input-type=module <<'NODE'
import { readFileSync, readdirSync } from 'node:fs'
const pkg = JSON.parse(readFileSync('package.json', 'utf8'))
const walk = root => readdirSync(root, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(`${root}/${e.name}`) : [`${root}/${e.name}`])
const files = ['README.md','README.zh-CN.md','SETUP.md','SETUP.zh-CN.md','MIGRATION.md','COMPOSABLE_WORKFLOWS.md','COMPOSABLE_WORKFLOWS.zh-CN.md','src/cli/init.ts', ...walk('plugin'), ...walk('openclaw'), ...walk('openclaw-plugin')]
const allowed = new Set([pkg.version, pkg.config.legacyNpmVersion])
for (const file of files) {
  if (!/\.(md|ts|json)$/.test(file)) continue
  for (const match of readFileSync(file, 'utf8').matchAll(/meigen@([0-9]+\.[0-9]+\.[0-9]+|latest)/g)) {
    if (!allowed.has(match[1])) throw new Error(`Unexpected npm pin ${match[0]} in ${file}`)
  }
}
console.log('Active guidance uses only the prepared bridge or explicitly retained legacy pin.')
NODE
