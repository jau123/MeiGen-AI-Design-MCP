---
description: >-
  Connect MeiGen through remote OAuth and verify tools without spending credits.
  Use for /meigen:setup or connection setup requests.
---

# MeiGen Setup

The owned plugin supplies one native remote MCP connection at `https://www.meigen.ai/api/mcp`. Reuse it. Other marketplace distributions may differ; inspect their actual manifest. Do not add duplicate servers or overwrite host-owned settings.

Guide the user to their host's MCP Connect / Authenticate action and browser OAuth consent. Never ask for passwords, API keys, authenticated curl or credential files in chat. Do not read or print secrets. Private library/character tools need their additional permissions.

For an existing stdio, fixed-key, wrapper or BYOK override, preserve it and explain migration first. Local BYOK/file handling/preferences remain in meigen@3.4.0; the 4.0 bridge also uses the remote server. Switching to OAuth requires the user's choice of account/provider; fixed API keys cannot enable the private library. Never create a new API key as a fallback.

Check `list_models` and `list_skills` without generating or uploading. These public calls prove connectivity only. Verify private access with an authorized read-only account operation when needed. A failed key/login requires corrected settings, not repeated paid requests.

Generation uses purchased credits only; daily free credits and Web free attempts do not apply. Read current schemas/prices before the user's authorized creation. Preserve each requestId and query status after interruption; do not create new paid jobs to test setup.
