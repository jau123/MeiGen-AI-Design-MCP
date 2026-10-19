# MeiGen MCP 3.3.0 — Midjourney advanced options

- `generate_image` accepts optional `referenceType: "content" | "style"` and `niji7Options`, matching the existing Web/App contract.
- Advanced options include stylize, chaos, raw, image/style weights, sref, profile, and MJ-specific `quality: "1" | "4"`. V8.2 fixes sv=6 and ignores weird. Top-level image quality remains separate.
- Local style files use `referenceImages` and the style role for the existing upload flow. Sref accepts numeric codes, random or public HTTPS image URLs, never local paths.
- Recovery keeps the original request ID and all advanced options. Reordering option keys is stable; changing their values or the reference role is an idempotency conflict. Omitted fields preserve old requests.
- These options are MeiGen-only and fail before dispatch for a BYOK provider. Existing API keys retain their current permissions; saved characters remain remote OAuth only.

Install with `npx -y meigen@3.3.0`, preserving existing private configuration, then reconnect. Confirm registry availability before using the new pin. Remote MCP and ChatGPT clients depend on the corresponding hosted schema deployment and review/refresh.
