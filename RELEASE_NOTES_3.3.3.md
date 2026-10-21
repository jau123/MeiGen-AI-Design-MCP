# MeiGen MCP 3.3.3 — Video failure recovery guidance

This patch preserves the optional, finite `failureDetail` values `video_edit_duration` and `reference_video_frame_rate` on terminal `invalid_request` results. Existing failure codes, request IDs and refund status remain compatible; unknown future detail values are ignored.

Seedance reference-video guidance now distinguishes generation/continuation from editing. Editing preserves a source video’s duration. Use a positive duration matching the rounded verified source duration (4–30 seconds); do not submit the provider-only `-1`. The backend only performs its bounded edit correction when every candidate source matches the already billed output duration. Mismatched or unknown durations fail through normal refund handling. A corrected paid request requires user authorization and a new request ID; an uncertain submission must retain its original ID.

Requires the matching Web API deployment for the new optional details and precharge frame-rate check. Existing integrations remain compatible. The independent ChatGPT adapter and bilingual docs have separate deployments. No paid generation is part of package validation.

After registry publication, existing stdio users can update to `npx -y meigen@3.3.3`, preserve private configuration, and restart/reconnect. A staged package or source push does not update installed clients.
