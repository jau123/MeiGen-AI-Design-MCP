---
description: >-
  List current MeiGen models and select a conversation-scoped default.
  Use when the user runs /meigen:models.
disable-model-invocation: true
---

# Models

Call the live `list_models` tool. Show relevant model names, IDs, supported inputs, ratios and current prices from the response. Do not invent availability, capabilities or prices. Public model discovery does not prove login.

If the user requests a selection, remember the exact chosen ID in this conversation and apply it only when a subsequent request omits its own model. This does not write a configuration file or change the server's defaults. The remote connection uses MeiGen; BYOK remains on legacy 3.4.0 and must not be silently substituted. Use host OAuth setup if a protected operation needs login.
