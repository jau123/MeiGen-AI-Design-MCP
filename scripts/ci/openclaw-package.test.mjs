import assert from 'node:assert/strict'
import test from 'node:test'
import { mkdtempSync, readFileSync, existsSync, rmSync, writeFileSync, mkdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'

test('OpenClaw artifact keeps its installed identity, remote OAuth and shared library guidance', t => {
  const root = mkdtempSync(join(tmpdir(), 'meigen-openclaw-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  const output = join(root, 'bundle')
  const builder = fileURLToPath(new URL('../build-openclaw-plugin.mjs', import.meta.url))
  const run = spawnSync(process.execPath, [builder, output], { encoding: 'utf8' })
  assert.equal(run.status, 0, run.stderr)
  const json = path => JSON.parse(readFileSync(join(output, path), 'utf8'))
  assert.equal(json('.claude-plugin/plugin.json').name, 'meigen')
  assert.equal(json('package.json').name, 'meigen-ai-design')
  assert.equal(json('.claude-plugin/plugin.json').version, json('package.json').version)
  assert.equal(json('openclaw.plugin.json').id, 'meigen')
  assert.equal(json('openclaw.plugin.json').version, json('package.json').version)
  assert.deepEqual(json('openclaw.plugin.json').mcpServers, json('.mcp.json').mcpServers)
  assert.equal(json('package.json').openclaw, undefined)
  assert.deepEqual(json('.mcp.json'), { mcpServers: { meigen: {
    url: 'https://www.meigen.ai/api/mcp', transport: 'streamable-http', auth: 'oauth', requestTimeoutMs: 240000,
  } } })
  const instructions = readFileSync(join(output, 'skills/MeiGen/SKILL.md'), 'utf8')
  const metadata = JSON.parse(instructions.match(/^metadata: (.+)$/m)[1])
  assert.ok(metadata.openclaw)
  assert.equal(metadata.openclaw.requires, undefined)
  for (const keyword of ['snapshotId', 'nextOffset', 'search_favorites', 'list_boards', 'search_history', 'get_library_item', 'save_favorite', 'explicit save request', 'upload_reference_media', 'list_characters', 'referenceMentionSyntax', 'contentReferenceImages', '256 MiB', '**17 local tools**', '**22 tools**']) assert.ok(instructions.includes(keyword), keyword)
  for (const guide of ['visual-creative', 'product-photoshoot', 'social-thumbnail']) assert.ok(existsSync(join(output, 'skills', guide, 'SKILL.md')))
  assert.ok(existsSync(join(output, 'skills/MeiGen/references/troubleshooting.md')))
  assert.ok(existsSync(join(output, 'LICENSE')))
  const checker = fileURLToPath(new URL('./check-openclaw-artifact.mjs', import.meta.url))
  const check = () => spawnSync(process.execPath, [checker, output], { encoding: 'utf8' })
  assert.equal(check().status, 0)
  mkdirSync(join(output, 'validation'))
  writeFileSync(join(output, 'validation/plugin-inspector-report.json'), '{}')
  assert.notEqual(check().status, 0, 'Inspector reports must not enter a release artifact')
  // A stale output directory must never silently mix files from two versions.
  writeFileSync(join(output, 'sentinel'), 'preserve')
  const retry = spawnSync(process.execPath, [builder, output], { encoding: 'utf8' })
  assert.notEqual(retry.status, 0)
  assert.equal(readFileSync(join(output, 'sentinel'), 'utf8'), 'preserve')
})
