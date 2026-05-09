#!/usr/bin/env node
/**
 * Lint frontmatter on agents/commands/skills.
 *
 * Rules (per CLAUDE.md):
 *  - Agents (plugin/agents/*.md): MUST have description; MUST NOT have `name:` (derived from filename).
 *  - Commands (plugin/commands/*.md): MUST have description; MUST NOT have `name:` (derived from filename).
 *  - Skills (plugin/skills/.../SKILL.md, openclaw/SKILL.md): MUST have name + description + version.
 *  - All frontmatter MUST be valid YAML-ish (between leading `---` markers).
 */

import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')

let errors = 0
const fail = (file, msg) => {
  console.error(`::error file=${relative(ROOT, file)}::${msg}`)
  errors++
}

function parseFrontmatter(file) {
  const text = readFileSync(file, 'utf8')
  const m = text.match(/^---\r?\n([\s\S]*?)\r?\n---/)
  if (!m) return null
  const body = m[1]
  const fields = {}
  // Crude line-level scan — sufficient for required-key presence checks.
  // Multi-line block scalars (>- / |) are detected as the key being present.
  for (const line of body.split('\n')) {
    const km = line.match(/^([A-Za-z_][A-Za-z0-9_-]*)\s*:/)
    if (km) fields[km[1]] = true
  }
  return fields
}

function walk(dir) {
  const out = []
  if (!statSync(dir, { throwIfNoEntry: false })) return out
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) out.push(...walk(full))
    else if (entry.endsWith('.md')) out.push(full)
  }
  return out
}

function checkAgents() {
  const dir = join(ROOT, 'plugin', 'agents')
  for (const file of walk(dir)) {
    const fm = parseFrontmatter(file)
    if (!fm) {
      fail(file, 'Missing frontmatter (---...---)')
      continue
    }
    if (!fm.description) fail(file, 'Agent frontmatter missing required field: description')
    if (fm.name) fail(file, 'Agent frontmatter must NOT contain `name:` — derived from filename')
  }
}

function checkCommands() {
  const dir = join(ROOT, 'plugin', 'commands')
  for (const file of walk(dir)) {
    const fm = parseFrontmatter(file)
    if (!fm) {
      fail(file, 'Missing frontmatter (---...---)')
      continue
    }
    if (!fm.description) fail(file, 'Command frontmatter missing required field: description')
    if (fm.name) fail(file, 'Command frontmatter must NOT contain `name:` — derived from filename')
  }
}

function checkSkills() {
  // Plugin skills
  const skillFiles = [
    ...walk(join(ROOT, 'plugin', 'skills')).filter((f) => f.endsWith('SKILL.md')),
    join(ROOT, 'openclaw', 'SKILL.md'),
  ]
  for (const file of skillFiles) {
    if (!statSync(file, { throwIfNoEntry: false })) continue
    const fm = parseFrontmatter(file)
    if (!fm) {
      fail(file, 'Missing frontmatter (---...---)')
      continue
    }
    for (const required of ['name', 'description', 'version']) {
      if (!fm[required]) fail(file, `Skill frontmatter missing required field: ${required}`)
    }
  }
}

checkAgents()
checkCommands()
checkSkills()

if (errors) {
  console.error(`\nFrontmatter lint failed: ${errors} error(s).`)
  process.exit(1)
}
console.log('Frontmatter lint passed.')
