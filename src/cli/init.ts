/**
 * `meigen init <platform>` — maintain a legacy local stdio connection
 *
 * Writes the correct MCP config file with the right format and path for each platform.
 * Merges into existing config if one already exists.
 */

import * as fs from 'node:fs'
import * as path from 'node:path'
import * as os from 'node:os'
import { randomUUID } from 'node:crypto'

interface PlatformConfig {
  name: string
  configPath: string
  wrapperKey: string
  needsType: boolean
  global?: boolean
}

const PLATFORMS: Record<string, PlatformConfig> = {
  cursor: {
    name: 'Cursor',
    configPath: '.cursor/mcp.json',
    wrapperKey: 'mcpServers',
    needsType: false,
  },
  vscode: {
    name: 'VS Code / GitHub Copilot',
    configPath: '.vscode/mcp.json',
    wrapperKey: 'servers',
    needsType: true,
  },
  windsurf: {
    name: 'Windsurf',
    configPath: path.join(os.homedir(), '.codeium', 'windsurf', 'mcp_config.json'),
    wrapperKey: 'mcpServers',
    needsType: false,
    global: true,
  },
  roo: {
    name: 'Roo Code',
    configPath: '.roo/mcp.json',
    wrapperKey: 'mcpServers',
    needsType: false,
  },
  claude: {
    name: 'Claude',
    configPath: '.mcp.json',
    wrapperKey: 'mcpServers',
    needsType: false,
  },
}

function printUsage(): void {
  console.log('Usage: meigen init <platform>')
  console.log('Legacy local stdio setup. New connections: https://www.meigen.ai/mcp (OAuth).')
  console.log()
  console.log('Supported platforms:')
  for (const [key, config] of Object.entries(PLATFORMS)) {
    console.log(`  ${key.padEnd(10)} ${config.name}`)
  }
  console.log()
  console.log('Examples:')
  console.log('  npx meigen init cursor')
  console.log('  npx meigen init vscode')
  console.log('  npx -y meigen@latest init windsurf')
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

/** Recognize only the direct npm invocation documented for local MeiGen connections. */
function isLocalMeigenCommand(entry: Record<string, unknown>): boolean {
  if (typeof entry.command !== 'string' || !Array.isArray(entry.args)) return false
  const executable = path.win32.basename(path.posix.basename(entry.command))
  if (!['npx', 'npx.cmd'].includes(executable)) return false
  if (entry.command !== executable && !path.posix.isAbsolute(entry.command) && !path.win32.isAbsolute(entry.command)) return false
  const args = entry.args[0] === '-y' || entry.args[0] === '--yes' ? entry.args.slice(1) : entry.args
  return args.length === 1 && typeof args[0] === 'string' &&
    /^meigen(?:@(?:latest|\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?))?$/.test(args[0])
}

/** Preserve existing connection options; never recover malformed config by replacing it. */
export function updateMcpConfig(configPath: string, platform: Pick<PlatformConfig, 'wrapperKey' | 'needsType'>): { backupPath?: string } {
  let original: string | undefined
  let mode = 0o600
  try {
    const stat = fs.lstatSync(configPath)
    if (!stat.isFile()) throw new Error('Config must be a regular file. Edit linked or non-file configurations manually.')
    mode = stat.mode & 0o777
    original = fs.readFileSync(configPath, 'utf8')
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error
  }

  let config: unknown = {}
  if (original !== undefined) {
    try { config = JSON.parse(original) }
    catch { throw new Error('Config is not valid strict JSON (comments and trailing commas are unsupported). Nothing was changed; back up the file and edit only the MeiGen version manually.') }
  }
  if (!isObject(config)) throw new Error('Config must contain a JSON object. Nothing was changed.')
  const wrapper = Object.hasOwn(config, platform.wrapperKey) ? config[platform.wrapperKey] : {}
  if (!isObject(wrapper)) throw new Error(`Config ${platform.wrapperKey} must be an object. Nothing was changed.`)
  const existing = Object.hasOwn(wrapper, 'meigen') ? wrapper.meigen : undefined
  if (existing !== undefined && !isObject(existing)) throw new Error('The existing MeiGen entry must be an object. Nothing was changed.')
  if (existing && (Object.hasOwn(existing, 'url') || (existing.type !== undefined && existing.type !== 'stdio'))) {
    throw new Error('The existing MeiGen entry is a remote connection. Keep its OAuth configuration; init only maintains local stdio connections. Nothing was changed.')
  }
  if (existing && !isLocalMeigenCommand(existing)) {
    throw new Error('The existing MeiGen command is not a recognized direct npx MeiGen connection. Keep OAuth proxies and custom commands intact; review and edit the configuration manually. Nothing was changed.')
  }
  wrapper.meigen = {
    ...(existing ?? (platform.needsType ? { type: 'stdio' } : {})),
    command: existing?.command ?? 'npx',
    args: ['-y', 'meigen@latest'],
  }
  config[platform.wrapperKey] = wrapper

  fs.mkdirSync(path.dirname(configPath), { recursive: true })
  const temporary = `${configPath}.${randomUUID()}.tmp`
  const backupPath = original === undefined ? undefined : `${configPath}.${randomUUID()}.bak`
  const writeSynced = (file: string, content: string, permissions: number) => {
    const descriptor = fs.openSync(file, 'wx', permissions)
    try { fs.writeFileSync(descriptor, content, 'utf8'); fs.fsyncSync(descriptor) }
    finally { fs.closeSync(descriptor) }
  }
  try {
    // Backups can contain credentials: always create them owner-readable only.
    if (backupPath) writeSynced(backupPath, original!, 0o600)
    writeSynced(temporary, JSON.stringify(config, null, 2) + '\n', mode)
    if (original === undefined) {
      // An atomic, no-clobber install also protects a file created after our initial read.
      fs.linkSync(temporary, configPath)
    } else {
      if (fs.readFileSync(configPath, 'utf8') !== original) throw new Error('Config changed during setup. Nothing was overwritten; retry after reviewing it.')
      fs.renameSync(temporary, configPath)
    }
  } finally {
    try { fs.unlinkSync(temporary) }
    catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error }
  }
  return backupPath ? { backupPath } : {}
}

export function init(args: string[]): void {
  const platformKey = args[0]?.toLowerCase()

  if (!platformKey || platformKey === '--help' || platformKey === '-h') {
    printUsage()
    return
  }

  const platform = PLATFORMS[platformKey]
  if (!platform) {
    console.error(`Unknown platform: "${platformKey}"`)
    console.log()
    printUsage()
    process.exit(1)
  }

  const configPath = platform.global
    ? platform.configPath
    : path.resolve(process.cwd(), platform.configPath)

  let result: { backupPath?: string }
  try { result = updateMcpConfig(configPath, platform) }
  catch (error) {
    console.error(`Unable to update ${configPath}: ${error instanceof Error ? error.message : 'Configuration update failed.'}`)
    process.exitCode = 1
    return
  }

  // Output
  console.log()
  console.log(`  MeiGen legacy local MCP connection configured for ${platform.name}`)
  console.log(`  Config: ${configPath}`)
  if (result.backupPath) console.log(`  Private backup: ${result.backupPath}`)
  console.log('  The command follows meigen@latest. Pin its version manually for controlled upgrades.')
  console.log()
  console.log('Next steps:')
  console.log('  1. Restart your AI tool to load the new MCP server')
  console.log('  2. Start chatting — free features work out of the box:')
  console.log('     search_gallery, enhance_prompt, get_inspiration')
  console.log()
  console.log('  Existing legacy integrations may keep MEIGEN_API_TOKEN in private environment settings.')
  console.log('  Do not create a new API key for this setup or paste credentials into chat.')
  console.log('  New users: connect https://www.meigen.ai/api/mcp with OAuth account sign-in.')
  console.log('  Guide: https://www.meigen.ai/mcp — private library tools require remote OAuth.')
}
