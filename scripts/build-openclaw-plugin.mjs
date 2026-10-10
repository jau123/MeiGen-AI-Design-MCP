import { cp, mkdir, access } from 'node:fs/promises'
import { resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const destination = process.argv[2] && resolve(process.argv[2])
if (!destination) throw new Error('Usage: node scripts/build-openclaw-plugin.mjs <new-output-directory>')
try {
  await access(destination)
  throw new Error('Output directory already exists; choose a fresh directory.')
} catch (error) {
  if (error.code !== 'ENOENT') throw error
}
await mkdir(destination, { recursive: true })
await cp(resolve(root, 'openclaw-plugin'), destination, { recursive: true, errorOnExist: true })
await cp(resolve(root, 'LICENSE'), resolve(destination, 'LICENSE'))
await cp(resolve(root, 'openclaw'), resolve(destination, 'skills/MeiGen'), { recursive: true })
await cp(resolve(root, 'plugin/skills'), resolve(destination, 'skills'), { recursive: true })
console.log(destination)
