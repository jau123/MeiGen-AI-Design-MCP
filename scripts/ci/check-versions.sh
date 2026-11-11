#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"
node --input-type=module <<'NODE'
import { readFileSync } from 'node:fs'
const json = path => JSON.parse(readFileSync(path, 'utf8'))
const pkg = json('package.json')
const plugin = json('plugin/.claude-plugin/plugin.json')
const entry = json('.claude-plugin/marketplace.json').plugins.find(p => p.name === plugin.name)
const claw = json('openclaw-plugin/package.json')
const version = readFileSync('src/config.ts', 'utf8').match(/BRIDGE_VERSION = '([^']+)'/)?.[1]
if (version !== pkg.version) throw new Error('Bridge and npm versions differ')
if (entry?.version !== plugin.version || json('plugin/openclaw.plugin.json').version !== plugin.version) throw new Error('Owned plugin manifest versions differ')
for (const file of ['openclaw-plugin/.claude-plugin/plugin.json', 'openclaw-plugin/openclaw.plugin.json']) {
  if (json(file).version !== claw.version) throw new Error(`OpenClaw version mismatch: ${file}`)
}
for (const file of ['plugin/.mcp.json', 'plugin/openclaw.plugin.json', 'openclaw-plugin/.mcp.json', 'openclaw-plugin/openclaw.plugin.json']) {
  const server = json(file).mcpServers?.meigen
  if (server?.url !== pkg.config.remoteMcpUrl || server.command || server.args || server.headers) throw new Error(`Expected credential-free native remote manifest: ${file}`)
  if (file === 'plugin/.mcp.json' ? server.type !== 'http' : server.transport !== 'streamable-http' || server.auth !== 'oauth') throw new Error(`Remote transport mismatch: ${file}`)
}
for (const value of [pkg.version, pkg.config.distributionNpmVersion, pkg.config.legacyNpmVersion, plugin.version, claw.version]) if (!/^\d+\.\d+\.\d+$/.test(value)) throw new Error('Invalid channel version')
console.log(`Prepared npm ${pkg.version}; published pin ${pkg.config.distributionNpmVersion}; legacy ${pkg.config.legacyNpmVersion}; Claude ${plugin.version}; OpenClaw ${claw.version}`)
NODE
