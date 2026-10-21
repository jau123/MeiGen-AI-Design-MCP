# Authentication and result compatibility

The local npm MCP keeps API Key authentication, local file preparation/saving, BYOK and local preferences. No embedded OAuth client secret, browser login command or forced credential migration is added. Interactive remote clients may use OAuth through the Web `/api/mcp` endpoint once its separately reviewed deployment and registered client configuration are enabled. Existing local API keys remain compatible with generation, public search and Skills, but cannot access the private library. New connections use remote OAuth.

Remote OAuth uses the capabilities advertised by the deployed Web authorization server. Compatible public clients can use Client ID Metadata Documents (CIMD) or dynamic client registration (DCR), with S256 PKCE and callback/resource validation. Preregistered clients remain supported. The independent ChatGPT plugin keeps its own registered client and resource; credentials for the standard remote MCP cannot be used with that adapter. The host must support remote HTTP and the advertised OAuth flow.

Completed ordinary image/video results now contain standard MCP `resource_link` items with recognized MIME types alongside the original structured JSON, URLs and local save path. Skill results retain partial-module handling and gain MIME types. Gallery search and detail results also provide preview resources. A host that cannot display a preview can still open/download the original artifact. For protocol versions before 2025-06-18, resource links become text links while standard image blocks remain available. Preview or download failure never authorizes a new paid generation.

`check_generation` and `check_skill` are annotated as possibly writing: backend lookups may finalize expired tasks and settle refunds, although neither starts a replacement. Both are non-destructive and idempotent; search and uploads are non-idempotent because they consume quota. Preserve request IDs and report refunds only from actual status fields.

Tests run without production credentials or paid generation. Tests import source through tsx and run before any build, including a clean checkout. Cross-repository guidance can be checked with `node scripts/ci/check-guidance-sync.mjs /path/to/reviewed-web`.

Search is capped at three entries, including over-returned API responses. Each entry selects the matched still image (or the still thumbnail for a video) and provides a standard MCP `image` block when a safe preview can be prepared, plus its named `resource_link` and text fallback. Existing larger limit arguments remain accepted but are clamped.

Inline previews only fetch direct HTTPS assets on `images.meigen.ai`, with no credentials or redirects. Downloads are limited to 8 MiB, decoded inputs to 16 MP, outputs to a 384px JPEG / 256 KiB, with a four-second download budget and a two-second sharp processing timeout. The sharp timeout excludes time waiting in its queue; these are not a hard end-to-end latency guarantee. Failure leaves the entry and link available; it must not cause another search or a paid generation. Unsupported hosts may render links instead of thumbnails. Actual Claude/ChatGPT acceptance is still required after release.

## Account library (remote OAuth)

`search_favorites`, `list_boards`, `search_history`, `get_library_item` and `save_favorite` require the remote OAuth account connection. They are not registered in local stdio. API keys (including existing legacy MeiGen keys) and BYOK credentials cannot grant this access. Reads and saves do not spend generation credits.

Only existing authorized source IDs can be saved. Save is idempotent and does not toggle or overwrite an existing note; optional board destinations must be owned and private. The backend enforces ownership and visibility and projects only permitted user prompts/metadata, never internal Skill prompts. Local preferences and prompt bookmarks remain separate from the cloud collection.

Public `search_gallery` now uses live results only. First-page requests negotiate a snapshot. Continue with the original query, returned snapshotId and nextOffset; snapshots must not silently fall back after expiry or error. A server without a snapshot uses explicitly labeled live offset pagination instead. ComfyUI and the bundled prompt library are no longer distributed; existing private workflow files are left untouched.

Account-library tools are available only through the remote OAuth connection at `https://www.meigen.ai/api/mcp`, after MeiGen sign-in and consent. API keys and local npm cannot access favorites, boards, history or item details. Lists return prompt excerpts; use the remote `get_library_item` tool to read a selected full prompt in Unicode code-point pages (default 8000, maximum 16000). `prompt.length` is the total safe prompt length; `nextOffset=null` marks the final part. Full data appears once in `structuredContent`; text is a short summary.

## Video failure details

Failed video results can include optional `failureDetail`: `video_edit_duration` or `reference_video_frame_rate`, alongside the existing error and actual `creditsStatus`. Unknown future values are ignored. Editing in Seedance 2.5 preserves a 4–30 second source clip: set positive `duration` to the source’s rounded whole-second length; every candidate source must match. Continuation describes what happens next and generates new content. Do not send the internal provider value `duration=-1`. Correcting a terminal failure requires separate authorization and a new request ID; uncertain submissions retain their original ID and exact inputs. The ChatGPT Store adapter is maintained and released separately.
