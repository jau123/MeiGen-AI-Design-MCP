import test from 'node:test'
import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { spawn } from 'node:child_process'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { once } from 'node:events'
import { createInterface } from 'node:readline'
import bridge from '../src/bridge.js'

async function fixture(t, failTools = false) {
  const calls = []
  const server = createServer(async (req, res) => {
    if (req.method !== 'POST') { res.writeHead(req.url === '/mcp' ? 405 : 404).end(); return }
    let raw = ''; for await (const chunk of req) raw += chunk
    const message = JSON.parse(raw); calls.push(message)
    if (failTools && message.method === 'tools/list') { res.writeHead(503, { 'content-type': 'text/plain' }).end('PRIVATE_UPSTREAM_DIAGNOSTIC_MARKER'); return }
    if (!('id' in message)) { res.writeHead(202).end(); return }
    const result = message.method === 'initialize'
      ? { protocolVersion: '2025-11-25', capabilities: { tools: {} }, serverInfo: { name: 'fixture', version: '1' }, instructions: 'Live instructions' }
      : message.method === 'tools/list' ? { tools: [{ name: 'future_tool', inputSchema: { type: 'object', properties: { future: { type: 'boolean' } } } }] }
      : { content: [{ type: 'text', text: 'ok' }], structuredContent: message.params.arguments }
    res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ jsonrpc: '2.0', id: message.id, result }))
  })
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve))
  const dir = await mkdtemp(join(tmpdir(), 'meigen-oauth-test-'))
  const entry = fileURLToPath(new URL('../src/index.ts', import.meta.url))
  const oauth = fileURLToPath(new URL('../src/oauth-bridge.ts', import.meta.url))
  const code = `require(${JSON.stringify(entry)}).runStdioBridge(() => require(${JSON.stringify(oauth)}).startOAuthBridge('http://127.0.0.1:${server.address().port}/mcp')).catch(() => process.exit(1))`
  const child = spawn(process.execPath, ['--import', 'tsx', '-e', code], {
    env: { PATH: process.env.PATH, HOME: dir, USERPROFILE: dir, SystemRoot: process.env.SystemRoot ?? '', MCP_REMOTE_CONFIG_DIR: join(dir, 'auth') },
    stdio: ['pipe', 'pipe', 'pipe'],
  })
  const exited = once(child, 'exit')
  const messages = new Map(); const pending = new Map(); let logs = ''
  const lines = createInterface({ input: child.stdout })
  lines.on('line', line => { const message = JSON.parse(line); messages.set(message.id, message); pending.get(message.id)?.(message) })
  child.stderr.on('data', data => { logs += data })
  t.after(async () => {
    if (child.exitCode === null && child.signalCode === null) { child.kill('SIGTERM'); await exited }
    lines.close(); server.closeAllConnections(); await new Promise(resolve => server.close(resolve)); await rm(dir, { recursive: true, force: true })
  })
  const send = (id, method, params) => new Promise(resolve => {
    pending.set(id, resolve); child.stdin.write(JSON.stringify({ jsonrpc: '2.0', id, method, params }) + '\n')
  })
  return { child, send, exited, calls, logs: () => logs }
}

test('packaged OAuth dependency forwards live contracts and closes on host EOF', { timeout: 15000 }, async t => {
  const { child, send, exited, calls, logs } = await fixture(t)
  const init = await send(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fixture-host', version: '1' } })
  assert.equal(init.result.instructions, 'Live instructions')
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  assert.equal((await send(2, 'tools/list', {})).result.tools[0].name, 'future_tool')
  const args = { future: true, requestId: 'original', unknown: { preserve: 1 } }
  assert.deepEqual((await send(3, 'tools/call', { name: 'future_tool', arguments: args })).result.structuredContent, args)
  assert.match((await send(4, 'tools/call', { name: 'generate_image', arguments: { provider: 'openai' } })).error.message, /3.4.0/)
  assert.equal(calls.filter(m => m.method === 'tools/call').length, 1)
  child.stdin.end()
  const [code] = await exited
  assert.equal(code, 0, logs())
})

test('host EOF during startup closes without waiting for authorization', { timeout: 15000 }, async t => {
  const { child, exited, logs } = await fixture(t)
  child.stdin.end()
  const [code] = await exited
  assert.equal(code, 0, logs())
})

test('concurrent shutdown waits for the same remote cleanup', async () => {
  let finish
  const remote = { start: async () => {}, send: async () => {}, close: () => new Promise(resolve => { finish = resolve }) }
  const local = { start: async () => {}, send: async () => {}, close: async () => {} }
  const connected = await bridge.connectTransports(local, remote)
  const first = connected.close(); const second = connected.close()
  assert.equal(first, second)
  let done = false; second.then(() => { done = true })
  await Promise.resolve(); assert.equal(done, false)
  finish(); await second; assert.equal(done, true)
})

test('does not expose raw upstream error bodies through the OAuth dependency or protocol', { timeout: 15000 }, async t => {
  const { child, send, logs } = await fixture(t, true)
  await send(1, 'initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'fixture-host', version: '1' } })
  child.stdin.write(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/initialized' }) + '\n')
  const failed = await send(2, 'tools/list', {})
  assert.ok(failed.error); assert.doesNotMatch(JSON.stringify(failed) + logs(), /PRIVATE_UPSTREAM_DIAGNOSTIC_MARKER/)
  assert.match(failed.error.message, /original requestId/)
})
