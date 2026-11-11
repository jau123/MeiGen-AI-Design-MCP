import { existsSync, realpathSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { spawnSync } from 'node:child_process'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const registry = '--registry=https://registry.npmjs.org'

export function releasePlan(mode) {
  if (mode === 'check') return { command: 'npm', args: ['whoami', registry], credentials: true, cleanTree: false }
  if (mode === 'dry-run') return { command: 'pnpm', args: ['publish', '--access', 'public', registry, '--dry-run', '--no-git-checks'], credentials: false, cleanTree: false }
  if (mode === 'stage') return { command: 'npm', args: ['stage', 'publish', '--access', 'public', registry], credentials: true, cleanTree: true }
  if (mode === 'publish') return { command: 'pnpm', args: ['publish', '--access', 'public', registry], credentials: true, cleanTree: true }
  throw new Error('Usage: node scripts/release.mjs check|dry-run|stage|publish')
}

function run() {
  if (process.argv.length !== 3) throw new Error('Usage: node scripts/release.mjs check|dry-run|stage|publish')
  const plan = releasePlan(process.argv[2])
  if (plan.cleanTree) {
    const status = spawnSync('git', ['status', '--porcelain'], { cwd: root, encoding: 'utf8' })
    if (status.error || status.status !== 0) throw new Error('Could not verify the Git working tree; no package was submitted.')
    if (status.stdout.trim()) throw new Error('Stage/publish requires a clean Git working tree. Review and commit explicitly; use dry-run for uncommitted changes.')
  }
  if (process.argv[2] === 'stage') {
    const support = spawnSync('npm', ['stage', '--help'], { cwd: root, encoding: 'utf8', shell: process.platform === 'win32' })
    if (support.error || support.status !== 0 || !support.stdout.includes('stage publish')) {
      throw new Error('This npm CLI does not support npm stage publish. Use a CLI with staged publishing support; do not fall back to direct publish.')
    }
  }
  if (plan.credentials) {
    const envFile = resolve(root, '.env.local')
    if (existsSync(envFile)) {
      if (typeof process.loadEnvFile !== 'function') throw new Error('Use the project Node version (Volta) to load .env.local.')
      process.loadEnvFile(envFile)
    }
    const token = process.env.NPM_TOKEN?.trim()
    if (!token || /\s/.test(token)) throw new Error('Set NPM_TOKEN privately in this repository’s ignored .env.local or environment. Do not put it in chat or use a MeiGen API key.')
    if (token.startsWith('meigen_sk_')) throw new Error('NPM_TOKEN must be an npm token; MEIGEN_API_TOKEN is for generation only.')
  }
  const env = { ...process.env }
  if (plan.credentials) env.npm_config_userconfig = resolve(root, '.npmrc.release')
  // npm/pnpm are .cmd shims on Windows. Commands/args are constants selected above, never user shell text.
  const result = spawnSync(plan.command, plan.args, { cwd: root, env, stdio: 'inherit', shell: process.platform === 'win32' })
  if (result.error) throw new Error(`Could not start ${plan.command}: ${result.error.message}`)
  return result.status ?? 1
}

if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    process.exitCode = run()
  } catch (error) {
    console.error(error instanceof Error ? error.message : 'Release command failed.')
    process.exitCode = 1
  }
}
