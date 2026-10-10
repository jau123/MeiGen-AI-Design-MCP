/**
 * MeiGen MCP Server configuration
 * Priority: environment variables > ~/.config/meigen/config.json > defaults
 */

import { readFileSync } from 'fs'
import { join } from 'path'
import { homedir } from 'os'

export interface MeiGenConfig {
  // MeiGen platform mode
  meigenApiToken?: string

  // OpenAI-compatible mode (user's own key)
  openaiApiKey?: string
  openaiBaseUrl: string
  openaiModel: string

  // MeiGen API base URL
  meigenBaseUrl: string

  // Upload gateway (for reference image upload to R2)
  uploadGatewayUrl: string
}

export type ProviderType = 'openai' | 'meigen'

interface ConfigFile {
  meigenApiToken?: string
  openaiApiKey?: string
  openaiBaseUrl?: string
  openaiModel?: string
  uploadGatewayUrl?: string
}

function loadConfigFile(): ConfigFile {
  try {
    const configPath = join(homedir(), '.config', 'meigen', 'config.json')
    const content = readFileSync(configPath, 'utf-8')
    return JSON.parse(content) as ConfigFile
  } catch {
    return {}
  }
}

export function loadConfig(): MeiGenConfig {
  const file = loadConfigFile()
  return {
    meigenApiToken: process.env.MEIGEN_API_TOKEN || file.meigenApiToken,

    openaiApiKey: process.env.OPENAI_API_KEY || file.openaiApiKey,
    openaiBaseUrl: process.env.OPENAI_BASE_URL || file.openaiBaseUrl || 'https://api.openai.com',
    openaiModel: process.env.OPENAI_MODEL || file.openaiModel || 'gpt-image-2',

    meigenBaseUrl: process.env.MEIGEN_BASE_URL || 'https://www.meigen.ai',

    uploadGatewayUrl: process.env.UPLOAD_GATEWAY_URL || file.uploadGatewayUrl || 'https://gen.meigen.ai',
  }
}

/**
 * Detect available providers.
 * Priority: meigen > openai
 */
export function getAvailableProviders(config: MeiGenConfig): ProviderType[] {
  const providers: ProviderType[] = []
  if (config.meigenApiToken) providers.push('meigen')
  if (config.openaiApiKey) providers.push('openai')
  return providers
}

/** Get default provider (by priority) */
export function getDefaultProvider(config: MeiGenConfig): ProviderType | null {
  if (config.meigenApiToken) return 'meigen'
  if (config.openaiApiKey) return 'openai'
  return null
}
