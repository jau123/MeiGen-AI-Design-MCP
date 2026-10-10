---
description: >-
  List available AI models and switch the default model for this session.
  Use when user runs /meigen:models to see or change models.
disable-model-invocation: true
---

# Models & Provider Status

Show available models and let the user switch the default for this session.

## Instructions

1. Call `mcp__meigen__list_models` to get all available models and providers
2. Present results in a compact numbered list:
   - For MeiGen models: `[N] Model Name (ID: xxx) — ratios: ...`
   - For OpenAI-compatible: `[N] model-name (via custom API)`
   - If the user asks about cost, point them to https://www.meigen.ai/model-comparison (do not quote specific credit numbers)
3. Show current configuration status (which providers are active)
4. If the user only requested a list, return it. Ask for a selection only when a requested switch remains unresolved.
5. If user selects a model:
   - Remember the model ID in conversation context
   - Confirm: "Default model set to **[name]**. This model is the session default when a subsequent request does not specify another model."
   - For all future `generate_image` calls in this session, use this model ID only when the caller has not supplied its own model choice
6. If no providers are configured, show a brief message and suggest `/meigen:setup`

## Important

The model switch is session-scoped — it persists in the conversation context, not in config files.
When the user starts a new session, the default resets to the provider's default model.
