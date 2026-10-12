# MeiGen MCP 3.1.0 — reference media and saved characters

This additive release depends on the matching Web APIs. Deploy and verify those APIs before publishing the npm artifact.

- `upload_reference_media` prepares selected direct HTTPS MP4/MOV or WAV/MP3 references, returning a public temporary MeiGen URL and measured duration. No generation charge; positive purchased credits and account limits apply. Temporary media enter cleanup seven days after their latest upload.
- `generate_video.contentReferenceImages` distinguishes content references from endpoint frames. New requests pass `[]` for frames or an explicit content bank. Omission preserves legacy bodies and idempotency identities. Do not alter the inputs of an existing paid request.
- Read live `capabilities.videoInputs` and tier overrides for counts, mutual exclusions, aspect ratios, pricing and reference mention syntax. Declared syntax wins: HeyGen binds `[image1]`, `[video1]`, `[audio1]`; only models without declarations use Image N / Video N / Audio N. Availability remains backend-controlled; this release does not enable HeyGen.
- Remote OAuth adds `list_characters` with separate `meigen:characters:read` consent. It reads and reuses saved characters; no creation/editing/deletion. Never combine character tokens with first/last frames.
- Local image fingerprints stream from disk and retain metadata only. Upload rechecks the exact hash; changed files fail before generation. Local images, video and audio share a **256 MiB request total**; uploads are bounded and serialized per request. Previously accepted oversized local batches now require smaller files or prepared URLs.
- Existing API keys retain generation, public search, Skills and compatible reference preparation; they cannot access the private library or saved characters. New connections use remote OAuth.
- Published inventory: **17 local tools**, **22 remote OAuth tools**. Host discovery/refresh and any required consent determine what a user can access.

## Release gates

1. Set `MEDIA_CHARACTER_LEGAL_PUBLICATION.effectiveDate` in the Web repository to the actual publication date and ship the reviewed bilingual disclosures with the Web APIs. Do not backdate a development draft.
2. Deploy Web, verify legacy scalar references and scope isolation, then deploy the private adapter and refresh/rescan its tools. Verify attachments and character consent in the real host; local tests alone are not host acceptance.
3. Publish npm 3.1.0, verify the registry artifact/version, then distribute current pins and updated OpenClaw instructions. Record each channel’s publication result after readback.

For the earlier ComfyUI/offline-library removal, see [3.0 migration notes](RELEASE_NOTES_3.0.0.md).
