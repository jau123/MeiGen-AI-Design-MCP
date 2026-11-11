import assert from 'node:assert/strict'
import test from 'node:test'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { spawnSync } from 'node:child_process'

function fixture(t, gitStatus = ' M package.json\n', supportsStage = true, platform = process.platform) {
  const root = mkdtempSync(join(tmpdir(), 'meigen-release-test-'))
  t.after(() => rmSync(root, { recursive: true, force: true }))
  mkdirSync(join(root, 'scripts'))
  copyFileSync(new URL('../release.mjs', import.meta.url), join(root, 'scripts/release.mjs'))
  writeFileSync(join(root, '.env.local'), 'RELEASE_PRIVATE_FILE_LOADED=yes\n')
  const log = join(root, 'commands.jsonl')
  // Mock the child-process boundary inside a real Node process. POSIX executable
  // shebang fixtures cannot be spawned by native Node on Windows.
  const preload = join(root, 'mock-commands.cjs')
  writeFileSync(preload, `
Object.defineProperty(process, 'platform', { value: ${JSON.stringify(platform)} });
const cp = require('node:child_process');
const { syncBuiltinESMExports } = require('node:module');
cp.spawnSync = (command, args, options = {}) => {
  if (command === 'git') {
    if (JSON.stringify(args) !== JSON.stringify(['status', '--porcelain'])) throw new Error('Unexpected Git command');
    return { status: 0, stdout: ${JSON.stringify(gitStatus)}, stderr: '' };
  }
  if (!['npm', 'pnpm'].includes(command)) throw new Error('Unexpected subprocess: ' + command);
  const env = options.env ?? process.env;
  require('node:fs').appendFileSync(${JSON.stringify(log)}, JSON.stringify({ command, args, shell: options.shell, privateFileLoaded: env.RELEASE_PRIVATE_FILE_LOADED }) + '\\n');
  const stdout = args[0] === 'stage' && args[1] === '--help' ? ${JSON.stringify(supportsStage ? 'npm stage publish' : 'unknown command')} : '';
  return { status: 0, stdout, stderr: '' };
};
syncBuiltinESMExports();
`)
  const run = mode => spawnSync(process.execPath, ['--require', preload, join(root, 'scripts/release.mjs'), mode], {
    cwd: root,
    env: { NPM_TOKEN: 'npm_fixture_not_a_real_credential' },
    encoding: 'utf8',
  })
  const calls = () => existsSync(log) ? readFileSync(log, 'utf8').trim().split('\n').map(line => JSON.parse(line)) : []
  return { run, calls }
}

test('dirty-tree dry run never loads the private env file and remains non-publishing', t => {
  const f = fixture(t)
  assert.equal(f.run('dry-run').status, 0)
  assert.equal(f.calls().length, 1)
  const call = f.calls()[0]
  assert.equal(call.command, 'pnpm')
  assert.ok(call.args.includes('--dry-run'))
  assert.ok(call.args.includes('--no-git-checks'))
  assert.equal(call.privateFileLoaded, undefined)
})

test('dirty-tree staging is rejected before any npm process can submit a package', t => {
  const f = fixture(t)
  const result = f.run('stage')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /clean Git working tree/)
  assert.deepEqual(f.calls(), [])
})

test('unsupported staging CLI fails without a fallback to direct publish', t => {
  const f = fixture(t, '', false)
  const result = f.run('stage')
  assert.equal(result.status, 1)
  assert.match(result.stderr, /does not support npm stage publish/)
  assert.deepEqual(f.calls().map(call => call.args), [['stage', '--help']])
})

test('authorized staging command uses staged publication without auto-approval', t => {
  const f = fixture(t, '')
  assert.equal(f.run('stage').status, 0)
  assert.deepEqual(f.calls().map(call => call.args.slice(0, 2)), [['stage', '--help'], ['stage', 'publish']])
  assert.ok(f.calls().every(call => call.command === 'npm'))
  assert.equal(f.calls()[0].privateFileLoaded, undefined)
  assert.equal(f.calls()[1].privateFileLoaded, 'yes')
})


test('Windows release commands use the shell required by npm and pnpm cmd shims', t => {
  const f = fixture(t, '', true, 'win32')
  assert.equal(f.run('dry-run').status, 0)
  assert.equal(f.run('stage').status, 0)
  assert.ok(f.calls().every(call => call.shell === true))
  assert.ok(f.calls().flatMap(call => call.args).every(arg => /^[a-zA-Z0-9:/=.-]+$/.test(arg)))
})
