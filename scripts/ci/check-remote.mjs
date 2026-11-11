import assert from 'node:assert/strict'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { StreamableHTTPClientTransport } from '@modelcontextprotocol/sdk/client/streamableHttp.js'

// Read-only live smoke check. No credentials, uploads, generation or registry writes.
const client = new Client({ name: 'meigen-release-readonly', version: '4.0.0' })
const timeout = setTimeout(() => { console.error('Remote probe timed out.'); process.exit(1) }, 45000)
try {
  await client.connect(new StreamableHTTPClientTransport(new URL('https://www.meigen.ai/api/mcp')))
  const tools = []; let cursor
  do { const page = await client.listTools(cursor ? { cursor } : {}); tools.push(...page.tools); cursor = page.nextCursor } while (cursor)
  for (const name of ['list_models', 'list_skills', 'search_gallery', 'generate_image', 'generate_video', 'check_generation', 'search_favorites']) {
    assert.ok(tools.some(t => t.name === name && t.inputSchema.type === 'object'), `Missing tool/schema: ${name}`)
  }
  for (const name of ['list_models', 'list_skills']) {
    const result = await client.callTool({ name, arguments: {} })
    assert.ok(!result.isError, `${name} returned a tool error`)
    console.log(`${name}: success`)
  }
  console.log(`Remote initialized; ${tools.length} live tools; no generation submitted.`)
} finally { clearTimeout(timeout); await client.close() }
