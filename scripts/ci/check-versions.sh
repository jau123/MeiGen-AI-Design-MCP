#!/usr/bin/env bash
# Verify the npm/plugin version is consistent across the 5 critical files.
# Run on every PR/push; fails if any file drifts.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

# 1. package.json (source of truth)
PKG_VER=$(node -p "require('./package.json').version")

# 2. .claude-plugin/marketplace.json — plugins[0].version
MARKETPLACE_VER=$(node -p "require('./.claude-plugin/marketplace.json').plugins[0].version")

# 3. plugin/.claude-plugin/plugin.json — top-level version
PLUGIN_VER=$(node -p "require('./plugin/.claude-plugin/plugin.json').version")

# 4. plugin/.mcp.json — pinned npx version
MCP_PIN_VER=$(node -p "require('./plugin/.mcp.json').meigen.args.find(a => a.startsWith('meigen@')).split('@')[1]")

# 5. src/server.ts — McpServer({ version: '...' })
SERVER_VER=$(grep -oE "version: ['\"]([0-9]+\.[0-9]+\.[0-9]+)['\"]" src/server.ts | head -1 | sed -E "s/.*['\"]([0-9]+\.[0-9]+\.[0-9]+)['\"]/\1/")

echo "package.json                         : $PKG_VER (truth)"
echo "claude-plugin/marketplace.json       : $MARKETPLACE_VER"
echo "plugin/.claude-plugin/plugin.json    : $PLUGIN_VER"
echo "plugin/.mcp.json (npx pin)           : $MCP_PIN_VER"
echo "src/server.ts (McpServer version)    : $SERVER_VER"

FAIL=0
for FILE_VAR in MARKETPLACE_VER PLUGIN_VER MCP_PIN_VER SERVER_VER; do
  VAL="${!FILE_VAR}"
  if [[ "$VAL" != "$PKG_VER" ]]; then
    echo "::error::Version drift: $FILE_VAR=$VAL but package.json=$PKG_VER"
    FAIL=1
  fi
done

if [[ $FAIL -eq 1 ]]; then
  echo
  echo "Fix: bump these files to match package.json. See CLAUDE.md → 'Version sync checklist'."
  exit 1
fi

echo
echo "All five tracked files are in sync at $PKG_VER."
