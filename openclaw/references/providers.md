# Account and billing

All current MeiGen remote generation uses purchased MeiGen credits. Daily free credits and Web free attempts do not apply. Public discovery is free of generation charges. Read `list_models` / `list_skills` for current capabilities and prices.

Use remote OAuth at `https://www.meigen.ai/api/mcp` in a compatible host. Grant account-library and character scopes only when needed. Existing API keys remain compatible for supported generation/search/workflow operations but cannot access private library or characters. New connections do not require keys. Never ask for credentials in chat.

The npm 4.0 bridge forwards to the same server; it is not a BYOK or local-file runtime. Existing BYOK, preferences and automatic local file handling remain in meigen@3.4.0. Preserve the user's chosen provider and billing account; explicitly confirm a change before moving that workflow to MeiGen OAuth. The remote server cannot read a path on the user's machine.
