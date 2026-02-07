# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

LibreArt (package name: `meigen`) is an MCP (Model Context Protocol) server that gives LLMs AI image generation capabilities. It supports three provider backends: MeiGen platform API, OpenAI-compatible APIs, and local ComfyUI workflows.

## Commands

```bash
npm run build        # Compile TypeScript (tsc → dist/)
npm run dev          # Run in development mode (tsx src/index.ts)
npm run typecheck    # Type check without emitting (tsc --noEmit)
```

No test framework is configured. No linter is configured.

## Architecture

### Server Startup Flow

`bin/meigen-mcp.js` → `src/index.ts` → `src/server.ts:createServer()` → registers all tools → connects via stdio transport (`StdioServerTransport`).

### Tool Registration Pattern

Each tool in `src/tools/` exports a Zod schema and a `register*` function. Tools are registered in `server.ts:createServer()` with dependencies injected (server, apiClient, config). Tool functions return `{ content: [{ type: 'text' | 'image', ... }] }`. Error results include `isError: true`.

### MCP Tools (7 total)

| Tool | Read-only | Purpose |
|------|-----------|---------|
| `enhance_prompt` | yes | Returns system prompt for host LLM to expand a brief description. No API call — free. |
| `search_gallery` | yes | Searches local 1300+ curated prompt library. No API call — free. |
| `list_models` | yes | Lists available models across all configured providers. |
| `get_inspiration` | yes | Gets full prompt + images for a gallery entry (local first, API fallback). |
| `upload_reference_image` | no | Compresses local image (sharp, max 2MB/2048px) and uploads to R2, returns public URL. |
| `comfyui_workflow` | no | Manages ComfyUI workflow templates: list/view/import/modify/delete. |
| `generate_image` | no | Generates an image. Routes to one of three providers via switch/case. |

### Three Provider Backends

Configured via env vars or `~/.config/meigen/config.json`. Auto-detected priority: MeiGen > ComfyUI > OpenAI.

- **MeiGen** (`src/lib/meigen-api.ts`): HTTP client to meigen.ai. Submits generation requests then polls for results (3s interval, 5min timeout). Supports referenceImages natively (URL array).
- **ComfyUI** (`src/lib/providers/comfyui.ts`): Local workflow execution. Stores workflow JSONs in `~/.config/meigen/workflows/`. Auto-detects key nodes (KSampler → CLIPTextEncode, EmptyLatentImage, CheckpointLoader, LoadImage) and fills in prompt/seed/dimensions/reference images at runtime. Reference images are downloaded, uploaded to ComfyUI via `POST /upload/image`, then injected into LoadImage nodes.
- **OpenAI-compatible** (`src/lib/providers/openai.ts`): Standard `/v1/images/generations` endpoint. Works with OpenAI, Together AI, Fireworks AI, etc. gpt-image-1 supports reference images via `image` parameter; DALL-E series does not.

Concurrency: API providers (MeiGen/OpenAI) share a semaphore (max 4 parallel). ComfyUI is serial (max 1 — local GPU constraint). Semaphore in `src/lib/semaphore.ts`.

### Reference Image Flow

`upload_reference_image` replicates the frontend's (`meigen` project) upload logic for Node.js:
1. Read local file → compress with `sharp` (max 2MB, max 2048px — matches frontend `ReferenceImageUpload.tsx`)
2. `POST uploadGatewayUrl/upload/presign` → get presigned URL + public URL (no auth required)
3. `PUT` compressed buffer to presigned URL (Cloudflare R2)
4. Return public URL for use as `referenceImages` in `generate_image`

Upload utility: `src/lib/upload.ts`. Frontend reference: `/meigen/src/components/ReferenceImageUpload.tsx`.

### Prompt System

- `src/lib/prompts.ts`: Three style-specific system prompts (realistic, anime, illustration) used by `enhance_prompt` to guide the host LLM in expanding user descriptions.
- `src/lib/prompt-library.ts`: Lazy-loaded singleton over `data/trending-prompts.json` (1300+ curated prompts). Provides search, random browse, and category filtering. Uses `__dirname` for path resolution (CJS output).

### Design Philosophy: Instructions over Code

The project's core principle is **leverage LLM capabilities via well-crafted instructions, not code logic**. Instead of engineering complex branching in code, guide the host LLM through `SERVER_INSTRUCTIONS` and tool descriptions.

`src/server.ts` embeds `SERVER_INSTRUCTIONS` (passed to MCP as `instructions`) that defines a 4-phase workflow:
1. **Intent Assessment** — classify user intent (exploring / brief idea / detailed prompt / batch) and respond accordingly
2. **Generation Strategy** — single vs parallel vs batched generation, with hard limits
3. **Creative Presentation** — before/after generation commentary, display adaptation for CLI vs web environments
4. **Error Recovery** — diagnose errors and guide users, not just relay error messages

This is the primary mechanism for shaping user experience. When adding features, prefer updating instructions/descriptions over adding code branches.

## Key Config Paths

- User config: `~/.config/meigen/config.json`
- ComfyUI workflows: `~/.config/meigen/workflows/*.json`
- Env vars: `MEIGEN_API_TOKEN`, `OPENAI_API_KEY`, `OPENAI_BASE_URL`, `OPENAI_MODEL`, `COMFYUI_URL`, `UPLOAD_GATEWAY_URL`
- Upload gateway default: `https://gen.meigen.art/api` (presign endpoint, no auth)

## TypeScript Conventions

- Strict mode, ES2022 target, Node16 module resolution (outputs CJS)
- No `any` — use Zod for runtime validation at tool schema level
- Dependencies: `@modelcontextprotocol/sdk`, `zod`, `sharp`
