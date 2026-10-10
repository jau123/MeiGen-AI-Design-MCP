---
description: >-
  Configure MeiGen MCP credentials privately, or set up an
  OpenAI-compatible provider for ordinary image generation. Use for /meigen:setup,
  "configure meigen", "add API key", or connection setup requests.
---

# MeiGen Setup

Guide one decision at a time. Never ask the user to paste a token, API key, authenticated curl command, or credential-bearing config into chat. Never read or print existing credential files, parse secrets from user messages, or echo key prefixes. The user enters secrets through their host's private connection settings, a private editor, or their own terminal outside this conversation.

## Choose the connection

The self-hosted Claude marketplace plugin already bundles one local MCP server. Do not add a duplicate server. Other marketplace copies may package different components; inspect their own manifest before prescribing setup. `/meigen:setup` is a Claude command, not a command for other MCP hosts.

Public tools such as `search_gallery`, `enhance_prompt`, `get_inspiration`, `list_models`, and `list_skills` work without a key. Five dedicated workflows—Remove Background, Product Detail Images, Marketing Poster, AI Backgrounds, and Upscale—always require MeiGen and purchased credits. OpenAI-compatible providers support ordinary `generate_image`; they do not substitute for these five workflows or MeiGen video generation.

For a new MeiGen request, use OAuth account setup below. Preserve an explicitly selected existing BYOK provider for ordinary image generation. If a provider is already configured and working, avoid reconfiguration.

## MeiGen account sign-in

For new users, add `https://www.meigen.ai/api/mcp` as a remote Streamable HTTP MCP server, choose Connect / Authenticate, and complete the host's OAuth sign-in and consent flow. Remove a fixed Authorization header when switching to OAuth. The bundled local stdio server has no OAuth login or private favorites, boards or history tools; replace/disable that connection through host settings when switching rather than adding a duplicate. If this host cannot authenticate, use a compatible host or the official ChatGPT plugin. Do not direct new users to create API keys.

### Existing legacy configuration only

Preserve a working existing local API-key/BYOK setup when the user needs it. An existing legacy key may stay in `MEIGEN_API_TOKEN` or the private `meigenApiToken` config field; do not read or print it. Legacy remote fixed-key calls retain previous generation/search compatibility only. These keys cannot enable the private library. Restart/reconnect after changing settings.

Buying credits: https://www.meigen.ai/profile (mobile: https://www.meigen.ai/m/premium). Skills and MeiGen API-token generation use purchased credits only; daily free credits and Web free attempts cannot be used. `list_skills` supplies current Skill prices. The model-comparison page is for pricing, not checkout.

## OpenAI-compatible providers for ordinary images

Ask for the non-secret base URL and model ID, using the provider's current documentation. The user privately configures `OPENAI_API_KEY`, optionally `OPENAI_BASE_URL` and `OPENAI_MODEL`, or `openaiApiKey`, `openaiBaseUrl`, and `openaiModel` in the private MeiGen config. Do not solicit an API key or curl example. Do not infer model support from another provider's model names.

## Verify and continue

After the user confirms configuration is saved and the host is reconnected, use `list_skills` or `list_models` to verify that tools are reachable. These public calls do not prove that a paid API key is valid or that sufficient credits exist. Do not run a paid generation merely to test setup; resume only the user's authorized creation request.

For the five dedicated workflows, call the dedicated tool directly, without prompt enhancement or a generic image-generation agent. Preserve its `requestId` and follow `nextAction`; after an interrupted submission call `check_skill` with the original ID before any retry. Missing/invalid-key responses need corrected connection settings, not polling. Explain any remaining error without exposing the secret.
