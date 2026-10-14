# MeiGen MCP 3.1.1 — HeyGen reference videos

- Correctly distinguish the per-clip reference-video limit from the aggregate limit in the live model catalog. HeyGen permits up to three videos, 1–5 seconds each, totalling at most 15 seconds, when enabled by the backend.
- Honor the additive referenceAudio.canCombineWithVideo capability. HeyGen accepts video references, including their embedded audio, but rejects video plus a separate audio reference before uploads or a paid submission. Existing request receipts are recovered before validating a new request.
- Explain that HeyGen reference billing adds output seconds to each input video's rounded-up seconds. Read live prices, enabled capabilities and media limits from list_models.
- Reference-video availability remains backend-controlled. Deploy the matching Web guards before enabling it. Existing stdio users must update their npm pin to 3.1.1 and reconnect; remote OAuth MCP receives the server update automatically.

No credentials or paid generations are required to install this patch.
