---
description: Multi-platform release workflow for MeiGen MCP server. Use when user says "release", "publish", "bump version", or wants to publish a new version.
---

# Release Workflow

Execute the full release pipeline for MeiGen MCP server. Each step must succeed before proceeding to the next.

## Pre-flight Checks

1. Run `npm run typecheck` — abort if errors
2. Run `npm run build` — abort if errors
3. Confirm current branch is `main` and working tree is clean

## Version Bump

Ask user for the new version number, then update ALL of these files:

| File | What to update |
|------|---------------|
| `package.json` | `version` field |
| `src/server.ts` | server version string |
| `.claude-plugin/marketplace.json` | `version` field |
| `plugin/.claude-plugin/plugin.json` | `version` field |
| `plugin/.mcp.json` | pinned version in `npx -y meigen@X.Y.Z` |
| `README.md` | pinned `meigen@X.Y.Z` in mcp.json example |
| `README.zh-CN.md` | pinned `meigen@X.Y.Z` in mcp.json example |
| `plugin/README.md` | pinned `meigen@X.Y.Z` in mcp.json example |
| `openclaw/SKILL.md` | pinned `meigen@X.Y.Z` in Quick Start npx command |
| `openclaw/references/troubleshooting.md` | pinned `meigen@X.Y.Z` in Security section |

**Do NOT touch** `openclaw/SKILL.md` `version:` frontmatter — it has an independent version track.

## Publish to npm

```bash
npm publish --registry https://registry.npmjs.org --//registry.npmjs.org/:_authToken=<TOKEN>
```

Verify the package appears: `npm view meigen version --registry https://registry.npmjs.org`

## Git Commit & Push

Commit all changes with message: `chore: release vX.Y.Z`

Ask user before pushing.

## Optional: ClawHub Skill Update

Ask user if they want to publish to ClawHub:
```bash
clawhub publish ./openclaw --slug creative-toolkit --name "AI Image Generator & Editor — Nanobanana, GPT Image, ComfyUI" --version <SKILL_VERSION> --changelog "<msg>"
```

## Optional: ClawHub Bundle Plugin Update

Ask user if they want to update the bundle plugin:
```bash
clawhub package publish ./plugin --family bundle-plugin --name meigen-ai-design --display-name "AI Image Generator & Editor — Nanobanana, GPT Image, ComfyUI" --version <PLUGIN_VERSION> --bundle-format claude --host-targets claude-code,openclaw --source-repo jau123/MeiGen-AI-Design-MCP --source-commit <SHA> --source-ref main --source-path plugin --changelog "<msg>"
```

## Post-Release Checklist

- [ ] npm version verified
- [ ] All pinned versions updated
- [ ] Git pushed
- [ ] ClawHub skill updated (if requested)
- [ ] ClawHub bundle plugin updated (if requested)
- [ ] wshobson/agents fork README version updated (if needed)
- [ ] awesome-mcp-servers entry still accurate (if description changed)
