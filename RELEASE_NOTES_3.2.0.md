# MeiGen MCP 3.2.0 — Seedance video drafts

- `generate_video` accepts optional `draft: true` for models advertising `capabilities.draft.enabled`. This creates a paid 480p preview; ordinary generation is unchanged when omitted.
- New `render_video_draft` creates a separately authorized 1080p final from a completed draft. Read the current `seedanceDraft.finalCredits` from `check_generation`, show that additional cost, and obtain confirmation before submitting. The final costs the full quoted amount, not the difference between resolutions.
- Draft results preserve the expiry, current final quote and recovery handles while excluding provider-private identifiers. Drafts expire seven days after provider creation.
- Keep separate persistent request IDs for draft and final. Uncertain submissions recover through `check_generation`; never automatically create a replacement. A changed quote requires fresh confirmation and a new request ID. Retrying a failed final also requires its `retryFailedGenerationId` and separate authorization.
- Local stdio exposes 18 tools. Private libraries and saved characters remain remote OAuth only; existing API keys retain legacy generation, public search and Skills compatibility. MCP generation uses purchased credits.

For an existing local installation, change only its package argument to `meigen@3.2.0`, preserving credentials and other settings, then restart/reconnect. Remote OAuth clients use the hosted service and should refresh tool discovery. Confirm registry availability before installing a pinned release candidate.

The matching backend and official ChatGPT adapter have been deployed. Automated tests cover request forwarding, quotes, recovery and safe metadata. No real paid draft-to-final generation was performed for this release.
