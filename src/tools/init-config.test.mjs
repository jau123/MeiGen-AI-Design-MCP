import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { fileURLToPath } from 'node:url'
import initModule from '../cli/init.js'

const { updateMcpConfig } = initModule
const platform = { wrapperKey: 'mcpServers', needsType: false }
function fixture(t, raw) {
  const directory = fs.mkdtempSync(join(tmpdir(), 'meigen-init-'))
  t.after(() => fs.rmSync(directory, { recursive: true, force: true }))
  const file = join(directory, 'mcp.json')
  if (raw !== undefined) fs.writeFileSync(file, raw, { mode: 0o640 })
  return { directory, file }
}

test('init migration updates only command/args and privately backs up the exact original', t => {
  const original = {
    inputs: [{ id: 'unrelated-input' }],
    mcpServers: {
      other: { url: 'https://other.example/mcp', headers: { Authorization: 'Bearer other-fixture' } },
      meigen: { command: 'npx', args: ['-y', 'meigen@2.0.2'], env: { MEIGEN_API_TOKEN: 'legacy-fixture', OTHER: 'keep' }, timeout: 240000, startup_timeout_sec: 90, disabled: false, type: 'stdio', unknown: { options: [1, 2] } },
    },
  }
  const raw = JSON.stringify(original, null, 4) + '\n\n'
  const { directory, file } = fixture(t, raw)
  const previousMode = fs.statSync(file).mode & 0o777
  const { backupPath } = updateMcpConfig(file, platform)
  const expected = structuredClone(original)
  expected.mcpServers.meigen.command = 'npx'
  expected.mcpServers.meigen.args = ['-y', 'meigen@latest']
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), expected)
  assert.equal(fs.readFileSync(backupPath, 'utf8'), raw)
  if (process.platform !== 'win32') {
    assert.equal(fs.statSync(backupPath).mode & 0o777, 0o600)
    assert.equal(fs.statSync(file).mode & 0o777, previousMode)
  }
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith('.tmp')), false)
})

test('new VS Code config uses servers and stdio without a backup', t => {
  const { directory } = fixture(t)
  const file = join(directory, '.vscode', 'mcp.json')
  assert.deepEqual(updateMcpConfig(file, { wrapperKey: 'servers', needsType: true }), {})
  assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { servers: { meigen: { type: 'stdio', command: 'npx', args: ['-y', 'meigen@latest'] } } })
})

test('adding MeiGen preserves existing servers and top-level client settings', t => {
  const original = { settings: { unknown: true }, servers: { other: { command: 'existing' } } }
  const { file } = fixture(t, JSON.stringify(original))
  updateMcpConfig(file, { wrapperKey: 'servers', needsType: true })
  const updated = JSON.parse(fs.readFileSync(file, 'utf8'))
  assert.deepEqual(updated.settings, original.settings)
  assert.deepEqual(updated.servers.other, original.servers.other)
  assert.equal(updated.servers.meigen.type, 'stdio')
})

for (const [kind, raw] of [
  ['malformed JSON', '{"mcpServers": {'],
  ['JSONC comments', '{\n // Keep this personal configuration\n "mcpServers": {}\n}'],
  ['JSONC trailing comma', '{"mcpServers": {},}'],
  ['empty file', ''],
  ['null root', 'null'],
  ['array root', '[]'],
  ['null server map', '{"mcpServers": null}'],
  ['array server map', '{"mcpServers": []}'],
  ['invalid MeiGen entry', '{"mcpServers":{"meigen":"keep-me"}}'],
  ['null MeiGen entry', '{"mcpServers":{"meigen":null}}'],
  ['remote OAuth connection', '{"mcpServers":{"meigen":{"url":"https://www.meigen.ai/api/mcp","type":"http"}}}'],
]) {
  test(`init fails closed for ${kind} without changing bytes or creating a backup`, t => {
    const { file, directory } = fixture(t, raw)
    assert.throws(() => updateMcpConfig(file, platform), /Nothing was changed|Nothing was overwritten/i)
    assert.equal(fs.readFileSync(file, 'utf8'), raw)
    assert.deepEqual(fs.readdirSync(directory), ['mcp.json'])
  })
}

test('a failed atomic replacement leaves the original and backup intact and removes the temp file', t => {
  const raw = '{"mcpServers":{"meigen":{"command":"npx","args":["meigen@2.0.2"],"env":{"MEIGEN_API_TOKEN":"fixture"}}}}\n'
  const { file, directory } = fixture(t, raw)
  const rename = t.mock.method(fs, 'renameSync', () => { throw new Error('fixture rename failure') })
  assert.throws(() => updateMcpConfig(file, platform), /fixture rename failure/)
  rename.mock.restore()
  assert.equal(fs.readFileSync(file, 'utf8'), raw)
  const files = fs.readdirSync(directory)
  assert.equal(files.some(name => name.endsWith('.tmp')), false)
  assert.equal(fs.readFileSync(join(directory, files.find(name => name.endsWith('.bak'))), 'utf8'), raw)
})

for (const [kind, entry] of [
  ['stdio OAuth mcp-remote wrapper', { type: 'stdio', command: 'npx', args: ['-y', 'mcp-remote', 'https://www.meigen.ai/api/mcp'] }],
  ['shell wrapper', { command: 'sh', args: ['-c', 'npx -y meigen@2.0.2'] }],
  ['environment wrapper', { command: '/usr/bin/env', args: ['npx', '-y', 'meigen@2.0.2'] }],
  ['URL argument', { command: 'npx', args: ['-y', 'meigen@2.0.2', 'https://www.meigen.ai/api/mcp'] }],
  ['arbitrary node program', { command: 'node', args: ['/custom/meigen-proxy.js'] }],
  ['unknown npm package', { command: 'npx', args: ['-y', 'other-meigen@2.0.2'] }],
  ['package URL', { command: 'npx', args: ['meigen@https://example.test/package.tgz'] }],
  ['npm alias', { command: 'npx', args: ['meigen@npm:other-package'] }],
  ['npx proxy flags', { command: 'npx', args: ['--package=mcp-remote', 'meigen'] }],
  ['relative executable', { command: './npx', args: ['meigen'] }],
  ['unsupported npm exec wrapper', { command: 'npm', args: ['exec', '--', 'meigen@2.0.2'] }],
  ['unsupported pnpm dlx wrapper', { command: 'pnpm', args: ['dlx', 'meigen@2.0.2'] }],
  ['local subcommand', { command: 'npx', args: ['meigen@2.0.2', 'gen'] }],
  ['missing invocation', {}],
]) {
  test(`init preserves ${kind} without writing files`, t => {
    const config = { mcpServers: { meigen: { ...entry, env: { PRIVATE_SETTING: 'keep-private' }, timeout: 240000 }, other: { command: 'other-server' } } }
    const raw = JSON.stringify(config, null, 4) + '\n'
    const { file, directory } = fixture(t, raw)
    assert.throws(() => updateMcpConfig(file, platform), /not a recognized direct npx MeiGen connection.*Nothing was changed/)
    assert.equal(fs.readFileSync(file, 'utf8'), raw)
    assert.deepEqual(fs.readdirSync(directory), ['mcp.json'])
  })
}

for (const [command, args] of [
  ['npx', ['meigen']],
  ['npx', ['-y', 'meigen@2.0.2']],
  ['npx', ['--yes', 'meigen@latest']],
  ['npx', ['meigen@3.0.0-rc.1']],
  ['/opt/homebrew/bin/npx', ['-y', 'meigen@2.0.2']],
  ['npx.cmd', ['--yes', 'meigen@2.0.2']],
  ['C:\\Program Files\\nodejs\\npx.cmd', ['meigen@2.0.2']],
]) {
  test(`init recognizes ${command} ${args.join(' ')} and preserves its executable path and options`, t => {
    const entry = { command, args, env: { MEIGEN_API_TOKEN: 'fixture' }, timeout: 240000 }
    const { file } = fixture(t, JSON.stringify({ mcpServers: { meigen: entry } }))
    const { backupPath } = updateMcpConfig(file, platform)
    assert.deepEqual(JSON.parse(fs.readFileSync(file, 'utf8')).mcpServers.meigen, { ...entry, args: ['-y', 'meigen@latest'] })
    assert.deepEqual(JSON.parse(fs.readFileSync(backupPath, 'utf8')).mcpServers.meigen, entry)
  })
}

test('init refuses a concurrent config change instead of overwriting it', t => {
  const { file, directory } = fixture(t, '{}\n')
  const read = fs.readFileSync
  let reads = 0
  const mock = t.mock.method(fs, 'readFileSync', (...args) => {
    if (args[0] === file && ++reads === 2) fs.writeFileSync(file, '{"concurrent":true}\n')
    return read(...args)
  })
  assert.throws(() => updateMcpConfig(file, platform), /changed during setup/)
  mock.mock.restore()
  assert.equal(fs.readFileSync(file, 'utf8'), '{"concurrent":true}\n')
  assert.equal(fs.readdirSync(directory).some(name => name.endsWith('.tmp')), false)
})

test('init help describes legacy compatibility and directs new connections to OAuth', t => {
  const output = []
  t.mock.method(console, 'log', line => output.push(line ?? ''))
  initModule.init(['--help'])
  assert.match(output.join('\n'), /Legacy local stdio.*OAuth/)
  assert.doesNotMatch(output.join('\n'), /Get one at|Settings > API Keys/)
})

test('the CLI exits unsuccessfully on JSONC and never prints a credential or destroys the config', t => {
  const { directory } = fixture(t)
  const configDirectory = join(directory, '.cursor')
  fs.mkdirSync(configDirectory)
  const file = join(configDirectory, 'mcp.json')
  const raw = '{ // existing config\n "mcpServers": {"meigen":{"env":{"MEIGEN_API_TOKEN":"secret-fixture"}}}\n}'
  fs.writeFileSync(file, raw)
  const initPath = fileURLToPath(new URL('../cli/init.ts', import.meta.url))
  const result = spawnSync(process.execPath, ['--import', import.meta.resolve('tsx'), '-e', `require(${JSON.stringify(initPath)}).init(['cursor'])`], { cwd: directory, encoding: 'utf8' })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /not valid strict JSON/)
  assert.doesNotMatch(result.stdout + result.stderr, /secret-fixture/)
  assert.equal(fs.readFileSync(file, 'utf8'), raw)
})
