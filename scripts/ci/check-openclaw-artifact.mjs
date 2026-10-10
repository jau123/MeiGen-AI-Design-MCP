import assert from 'node:assert/strict'
import { readdirSync } from 'node:fs'
import { resolve, join } from 'node:path'

const root = process.argv[2] && resolve(process.argv[2])
if (!root) throw new Error('Usage: node scripts/ci/check-openclaw-artifact.mjs <bundle-directory>')
function files(dir, prefix = '') {
  return readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    if (entry.isSymbolicLink()) throw new Error(`Unexpected symlink: ${entry.name}`)
    const name = `${prefix}${entry.name}`
    return entry.isDirectory() ? files(join(dir, entry.name), `${name}/`) : [name]
  })
}
const expected = [
  '.claude-plugin/plugin.json', '.mcp.json', 'LICENSE', 'README.md', 'openclaw.plugin.json', 'package.json',
  'skills/MeiGen/SKILL.md', 'skills/MeiGen/references/providers.md', 'skills/MeiGen/references/troubleshooting.md',
  'skills/product-photoshoot/SKILL.md', 'skills/social-thumbnail/SKILL.md', 'skills/visual-creative/SKILL.md',
]
assert.deepEqual(files(root).sort(), expected.sort(), 'Unexpected artifact contents; keep validation reports and local files outside the bundle.')
console.log(`OpenClaw artifact allowlist passed: ${expected.length} files.`)
