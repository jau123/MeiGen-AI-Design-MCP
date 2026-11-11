# MeiGen 4.0.0 — final npm feature release

Status: published on npm on 2026-11-11. SHA-1: `fa69aaac2cfc1842fa5887bcbfeafa85ebf02d21`. The public 35-file tarball matches the reviewed stage byte for byte; Linux and Windows CI passed.

- `meigen` and `meigen-mcp` become stdio bridges to the hosted Streamable HTTP endpoint.
- Tools, schemas, instructions and results come from the remote server. Generation/search/billing are no longer reimplemented in npm.
- OAuth for new connections; existing MeiGen keys retain their identity through a fixed-key bridge. No OAuth fallback after a failed key.
- Native remote manifests for the owned Claude marketplace; OpenClaw stays native remote. Setup no longer asks for new API keys.
- Node.js 22.19+ required; Node.js 24 recommended. Runtime dependencies pinned and pnpm lock tracked.
- BYOK, local file processing/downloads, local preferences, local prompt enhancement and `gen` remain in 3.4.0. Legacy source stays under its tag.

Read [migration and rollback](MIGRATION.md). Existing version pins need one deliberate update. Server-side fixes do not normally need another npm release; host caches and protocol/security updates remain separate constraints. No package publication, marketplace update or production deployment is performed by these source changes.
