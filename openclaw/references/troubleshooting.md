# Connection and recovery

- Missing tools: confirm the remote URL `https://www.meigen.ai/api/mcp`, reconnect and refresh the live tool list. A Skill is guidance, not a server installation.
- OAuth: complete host browser login and requested consent. Public `list_models` or `list_skills` success is not proof of private access. Saved OpenClaw server entries override bundle defaults; inspect them privately without exposing credentials.
- Existing API key: never silently switch to another account if it fails. Fixed keys cannot access private library/characters. Deliberately select OAuth for these features.
- Legacy local behavior: retain `meigen@3.4.0` for BYOK, local file handling or preferences. npm 4.0 is only a remote bridge. Do not erase the old config or add duplicate active servers.
- References: the server cannot read local paths. Supply an actual accessible direct URL or supported upload bytes. Never invent paths/base64. Uploads may create public temporary URLs; disclose this and follow live size/duration limits.
- Interrupted paid job: preserve original requestId and inputs; query check_generation/check_skill before any retry. Follow nextAction and Retry-After. Never create a replacement paid job automatically.
- Billing: purchased credits only; no daily free credits or Web free attempts. Check live prices and reconcile partial outputs/refunds separately. A failed response does not imply that nothing was billed.
