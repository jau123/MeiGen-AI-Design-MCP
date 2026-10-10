# MeiGen Optimization Roadmap

> Based on comparison with [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) — 2026-02-10

## High Priority

### 1. README Documentation Enhancement

**Current state**: README covers basic usage but lacks visual examples and comparison guides.

**Improvements**:
- [ ] Add real generation result showcase (before/after prompt enhancement)
- [ ] Add Provider comparison table (MeiGen vs OpenAI-compatible pros/cons)
- [ ] Add more usage scenario examples (logo design, product photography, batch generation)
- [ ] Add ASCII/Mermaid workflow diagrams (generation flow, reference image flow)
- [ ] Add tool capability overview table with statistics from the runtime tool inventory

**Reference**: ui-ux-pro-max has 23KB README with feature tables, ASCII diagrams, real output examples, and anti-pattern lists.

**Effort**: Small | **Impact**: High — first impression for new users

---

### 2. Search Relevance Optimization

**Current state**: `search_gallery` uses live semantic search. The bundled offline prompt library has been removed.

**Improvements**:
- [ ] Improve online search relevance using user feedback
- [ ] Add meaningful search relevance indicators when the API provides them

**Effort**: Medium | **Impact**: High — directly improves gallery discovery experience

---

## Medium Priority

### 3. Multi-Platform MCP Setup — DONE

**Implemented**: `npx meigen init <platform>` — integrated into existing package, zero new dependencies.

**Supported platforms**:
- [x] Cursor — `.cursor/mcp.json` (`mcpServers` format)
- [x] VS Code / GitHub Copilot — `.vscode/mcp.json` (`servers` format + `type: "stdio"`)
- [x] Windsurf — `~/.codeium/windsurf/mcp_config.json` (global, `mcpServers` format)
- [x] Roo Code — `.roo/mcp.json` (`mcpServers` format)
- [x] Claude — `.mcp.json` (`mcpServers` format)

**Key design decisions**:
- No separate CLI package — subcommand of existing `meigen` binary (~80 lines)
- Merges into existing config files without overwriting other servers
- All platforms use the same `npx -y meigen@latest` server definition, only wrapper format and file path differ

**Files**: `src/cli/init.ts`, `bin/meigen-mcp.js`

**Effort**: Small (was estimated Large) | **Impact**: High — expands user base beyond Claude

---

## Low Priority

### 4. Brand Style Persistence (Instructions Update)

**Current state**: Each generation is independent; no mechanism to maintain style consistency across a multi-image project.

**Improvements**:
- [ ] Add "Brand Style Master" workflow guidance in SERVER_INSTRUCTIONS
- [ ] Guide LLM to create a style reference file (colors, typography, mood, composition rules)
- [ ] Subsequent generations auto-reference the style file for consistency
- [ ] No code changes needed — pure instruction/skill update

**Reference**: ui-ux-pro-max uses Master + Overrides pattern (MASTER.md + pages/*.md) for hierarchical design system persistence.

**Effort**: Small | **Impact**: Medium — valuable for professional multi-image workflows

---

### 5. Skill Activation Strategy

**Current state**: `visual-creative` skill triggers on image-related keywords.

**Improvements**:
- [ ] Review marketplace.json for `strict` mode configuration
- [ ] Test activation reliability across edge-case prompts
- [ ] Expand trigger keywords if needed (e.g., brand design, mockup, visual identity)
- [ ] Consider adding `strict: false` if not already set

**Reference**: ui-ux-pro-max uses `"strict": false` in marketplace.json for broader skill activation.

**Effort**: Small | **Impact**: Low — marginal improvement

---

## Not Planned

| Item | Reason |
|------|--------|
| Python search engine | Already have TypeScript MCP server, no need for Python |
| Symlink strategy | npx distribution eliminates duplication problem |
| Bundled prompt data | Use the current online gallery instead of a stale package snapshot |

---

## Notes

- Priorities may shift based on user feedback and usage data
- "Effort" is relative: Small (~1 day), Medium (~3 days), Large (~1 week+)
- All changes should follow the project's "Instructions over Code" philosophy — prefer updating SKILL.md / SERVER_INSTRUCTIONS over adding code branches
