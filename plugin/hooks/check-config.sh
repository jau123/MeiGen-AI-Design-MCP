#!/bin/bash
# MeiGen Plugin — SessionStart config check
# Show setup guide on first launch if no API key is configured

CONFIG_FILE="$HOME/.config/meigen/config.json"

has_env_config() {
  [ -n "$MEIGEN_API_TOKEN" ] || [ -n "$OPENAI_API_KEY" ]
}

has_file_config() {
  [ -f "$CONFIG_FILE" ]
}

if has_env_config || has_file_config; then
  exit 0
fi

cat << 'EOF'
MeiGen visual creative plugin loaded.

No API key configured. Free features (inspiration search, prompt enhancement) are available without configuration.
To enable image generation, run: /meigen:setup
EOF
