import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { homedir } from 'node:os'

export const REMOTE_URL = 'https://www.meigen.ai/api/mcp'
export const BRIDGE_VERSION = '4.0.0'
export const LEGACY_VERSION = '3.4.0'

/** Read only the existing config; never migrate or rewrite credentials on startup. */
export function connectionConfig(env: NodeJS.ProcessEnv = process.env, configPath = join(homedir(), '.config/meigen/config.json'), oauthOnly = false) {
  if (env.MEIGEN_BASE_URL && env.MEIGEN_BASE_URL.replace(/\/$/, '') !== 'https://www.meigen.ai') {
    throw new Error('Custom MEIGEN_BASE_URL is not supported by the remote bridge. Preserve this connection on meigen@3.4.0 or configure its remote URL directly in your host.')
  }
  if (oauthOnly) return { mode: 'oauth' as const, url: REMOTE_URL }
  let file: Record<string, unknown> = {}
  try {
    const data: unknown = JSON.parse(readFileSync(configPath, 'utf8'))
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw new Error('Invalid config')
    file = data as Record<string, unknown>
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new Error('Cannot read the existing MeiGen configuration. Nothing was changed. Check it privately, or use --oauth to select account sign-in explicitly.')
  }
  const token = env.MEIGEN_API_TOKEN || file.meigenApiToken
  if (token !== undefined && token !== '') {
    if (typeof token !== 'string' || !/^meigen_sk_[A-Za-z0-9_-]+$/.test(token) || token.length > 16384) throw new Error('The configured MeiGen API token is invalid. Check it privately or select --oauth. Credentials were not sent.')
    return { mode: 'api-key' as const, url: REMOTE_URL, token }
  }
  if (env.OPENAI_API_KEY || file.openaiApiKey) throw new Error('An existing BYOK configuration was found. Keep meigen@3.4.0 for that provider, or select --oauth to connect to MeiGen explicitly. No provider or billing account was changed.')
  return { mode: 'oauth' as const, url: REMOTE_URL }
}
