#!/usr/bin/env bash
# Verify every distribution doc that pins `meigen@<ver>` matches package.json,
# and that no doc accidentally uses `meigen@latest` (supply-chain risk).
#
# Exception: src/cli/init.ts intentionally uses `meigen@latest` because it generates
# end-user MCP configs — those should auto-update via npm.

set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
cd "$ROOT"

PKG_VER=$(node -p "require('./package.json').version")
EXPECTED="meigen@${PKG_VER}"

# Files that MUST pin the current version. Edit when adding new distribution docs.
DIST_FILES=(
  "README.md"
  "README.zh-CN.md"
  "plugin/README.md"
  "plugin/.mcp.json"
  "openclaw/SKILL.md"
  "openclaw/references/troubleshooting.md"
)

FAIL=0
for f in "${DIST_FILES[@]}"; do
  if [[ ! -f "$f" ]]; then
    echo "::warning::Tracked file missing (delete from check-pinned-npm.sh if intentional): $f"
    continue
  fi

  # Find every meigen@<ver> reference.
  HITS=$(grep -oE 'meigen@[0-9]+\.[0-9]+\.[0-9]+|meigen@latest' "$f" || true)

  if [[ -z "$HITS" ]]; then
    echo "::error::$f has no meigen@<version> pin — should reference $EXPECTED"
    FAIL=1
    continue
  fi

  while IFS= read -r hit; do
    if [[ "$hit" == "meigen@latest" ]]; then
      echo "::error::$f uses 'meigen@latest' — pin to $EXPECTED instead"
      FAIL=1
    elif [[ "$hit" != "$EXPECTED" ]]; then
      echo "::error::$f pins '$hit' but should pin '$EXPECTED'"
      FAIL=1
    fi
  done <<< "$HITS"
done

if [[ $FAIL -eq 1 ]]; then
  exit 1
fi

echo "All distribution docs pin $EXPECTED."
