# Troubleshooting

| Symptom | Next step |
|---|---|
| Missing MeiGen authorization | Sign in through remote OAuth at https://www.meigen.ai/api/mcp. For an existing legacy integration only, privately check its configured key and reconnect. Do not create a new key or poll a rejected request. |
| Insufficient credits | Explain `required`, `available`, and the shortfall. Purchase on https://www.meigen.ai/profile (mobile: https://www.meigen.ai/m/premium), using the connected MeiGen account. Daily credits are unavailable. After topping up and choosing to continue: for `generate_image` / `generate_video`, resend the exact original inputs with the **same** `requestId` (the rejected request was never charged); for Skills, follow the tool's returned `nextAction`. |
| Interrupted Skill submission or temporary status error | Call `check_skill` with the original skill and `requestId`; follow `nextAction`. Never create a new ID or pay for replacements automatically. |
| Temporary upload failure | Follow `retry_upload` and its wait; retry the same upload at most once. No generation has started, so `check_skill` is not needed. Report persistent failure. |
| Image preparation rejects format/size | Correct the actual source using returned details. Standard Skill base64 input is at most 3 MiB decoded; source uploads and preparation have separate limits. Do not blindly retry unchanged bytes. |
| Upscale requires downscaling permission | Explain the 4096px/16 MP preprocessing and that output may be smaller than the original. Set `allowDownscale` only after explicit acceptance, using a new `requestId` for the changed input. Do not send the source through standard Skill upload/compression. |
| Upscale price changed | Show the returned current charge, ask for explicit acceptance, then submit a new `requestId` and the required `confirmedCredits`. Do not silently accept a price change. |
| Attachment cannot be read | Ask for a public direct HTTPS image URL or an accessible file for a local npm connection. Never guess paths or base64. For Upscale use the original PNG/JPEG/WebP URL, or an actual local file through the npm Upscale tool, at most 64 MiB/64 MP. |
| Interrupted ordinary image/video generation | Use `check_generation` with the original `requestId` or returned `generationId`; request-ID lookup works across restarts. Keep exact inputs and IDs on transient failure. A new ID starts a new paid attempt. |
| BYOK billing error | Check the configured provider's account and billing; topping up MeiGen does not repair another provider's balance. |
| New tools missing | For an existing local connection, update the MCP pin to `meigen@3.1.0` while preserving other settings, then reconnect. For favorites, boards and history, use remote OAuth and approve any missing library permissions; local npm cannot provide these tools. Refresh the host's tool list. |

## Data handling

The standalone Skill supplies connection and usage instructions. Remote OAuth calls MeiGen's hosted MCP service; the legacy local setup starts the pinned `meigen@3.1.0` package. Source is available at https://github.com/jau123/MeiGen-AI-Design-MCP. A version pin does not itself establish an installed release's behavior; inspect the package you run.

**Reference data leaves the machine on cloud routes.** MeiGen generation and Skills send prompts, references and job metadata to MeiGen and its selected generation providers. Preparing a reference can upload it to the configured upload service/CDN and return a publicly accessible URL. Treat these as shareable links, not private attachments. Do not promise a retention period or a deletion guarantee. Upscale uses the original source URL and its own backend preparation; it must not use the standard compressed-reference path.

**Local behavior has boundaries.** The npm server reads user-supplied reference paths, its private configuration, local preferences; it may save generated outputs and upload prepared references. It does not need to scan unrelated image folders. Composed npm calls can use `wait: false`, `download: false`; local synchronous defaults still download unless disabled. Standard Skill preparation corrects orientation, decodes and re-encodes supported images without source metadata, preserving transparency where applicable. Ordinary generation and third-party providers have separate preparation paths; do not promise that every URL or provider strips EXIF.

**Credentials and service records.** Credentials belong in private host settings/environment or the local MeiGen config, never chat or shared files. The server forwards credentials to the configured API endpoint; custom endpoint settings change that destination. MeiGen cloud services retain operational/account data needed for generation, billing and recovery. Do not claim that no usage data is collected or no third party receives data. See https://www.meigen.ai/privacy-policy for the service policy.
