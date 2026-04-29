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
   - For ComfyUI workflows: `[N] workflow-name — checkpoint, steps, sampler`
   - For OpenAI-compatible: `[N] model-name (via custom API)`
   - If the user asks about cost, point them to https://www.meigen.ai/model-comparison (do not quote specific credit numbers)
3. Show current configuration status (which providers are active)
4. Ask: "Enter a number to set as default model for this session, or press Enter to keep current."
5. If user selects a model:
   - Remember the model ID in conversation context
   - Confirm: "Default model set to **[name]**. All subsequent image generations will use this model."
   - For all future `generate_image` calls in this session, automatically pass this model ID
6. If no providers are configured, show a brief message and suggest `/meigen:setup`

## Important

The model switch is session-scoped — it persists in the conversation context, not in config files.
When the user starts a new session, the default resets to the provider's default model.
