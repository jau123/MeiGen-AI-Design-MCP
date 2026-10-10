#!/usr/bin/env bash
# Runtime pins follow npm. Distribution versions are independently owned.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const pkg = json('package.json')
const lock = json('package-lock.json')
const plugin = json('plugin/.claude-plugin/plugin.json')
const entry = json('.claude-plugin/marketplace.json').plugins.find(p => p.name === plugin.name)
const openclaw = json('openclaw-plugin/package.json')
const openclawManifest = json('openclaw-plugin/.claude-plugin/plugin.json')
if (openclaw.version !== openclawManifest.version) throw new Error('OpenClaw package and bundle manifest versions differ')
const server = readFileSync('src/server.ts', 'utf8').match(/version:\s*['"]([0-9]+\.[0-9]+\.[0-9]+)['"]/)?.[1]
const skill = readFileSync('openclaw/SKILL.md', 'utf8').match(/^version:\s*(\S+)/m)?.[1]
const semver = /^\d+\.\d+\.\d+(?:-[\w.-]+)?(?:\+[\w.-]+)?$/
const fail = message => { console.error(`::error::${message}`); process.exitCode = 1 }
if (lock.version !== pkg.version || lock.packages?.['']?.version !== pkg.version) fail('npm lockfile version must match package.json')
if (server !== pkg.version) fail(`MCP runtime ${server} differs from npm ${pkg.version}`)
if (!entry || entry.version !== plugin.version) fail('Self-owned Claude marketplace entry must match its plugin manifest version')
for (const [name, version] of [['npm', pkg.version], ['Claude plugin', plugin.version], ['OpenClaw plugin', openclaw.version], ['ClawHub standalone Skill', skill]]) {
  if (!version || !semver.test(version)) fail(`${name} has an invalid or missing version`)
  console.log(`${name}: ${version}`)
}
for (const [path, servers] of [['plugin/.mcp.json', json('plugin/.mcp.json').mcpServers], ['plugin/openclaw.plugin.json', json('plugin/openclaw.plugin.json').mcpServers]]) {
  const server = servers?.meigen
  if (server?.command !== 'npx' || !server.args?.includes(`meigen@${pkg.version}`)) fail(`${path} must declare the pinned meigen npm server`)
}
if (!process.exitCode) console.log('Runtime pins and independently versioned distribution manifests are coherent.')
NODE
