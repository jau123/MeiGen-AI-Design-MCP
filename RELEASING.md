# Maintaining the client bridge

This repository contains the remote connection bridge and client guides. Hosted tools and the official ChatGPT app are maintained separately. Changes here do not deploy those services.

## Local checks

Use pnpm and Node.js 24 (minimum 22.19):

```sh
pnpm install --frozen-lockfile
pnpm typecheck
pnpm test
node scripts/ci/check-frontmatter.mjs
bash scripts/ci/check-versions.sh
bash scripts/ci/check-pinned-npm.sh
pnpm build
```

`pnpm check:remote` checks live public discovery without generating or uploading. Browser sign-in and client rendering need separate manual verification; public discovery alone does not verify account access.

## Distribution

- The dedicated Claude plugin is retired; do not restore its marketplace, commands or agents. `plugin/README.md` is a migration notice for old links.
- The single OpenClaw guide lives under `openclaw/`; the bundle builder includes it under `skills/MeiGen/`. Its `.claude-plugin/plugin.json` is retained as bundle-format compatibility metadata, not a separately maintained Claude distribution.
- Prefer native remote HTTP with OAuth. Keep connection manifests free of credentials.
- The npm package is a compatibility bridge for stdio clients. New hosted tools normally do not require an npm release; transport or security fixes may.
- Validate the built OpenClaw bundle with Plugin Inspector against an explicit host version and retain the report; the current inspection target is `2026.9.9`, not an OAuth/runtime acceptance claim. Bundle versions live in its two manifests. The private `openclaw-plugin/package.json` is metadata only, without an npm version or native `openclaw` block: ClawHub otherwise incorrectly falls back from the npm version to `builtWithOpenClawVersion`. Always pass `--family bundle-plugin --bundle-format claude --name meigen-ai-design --version <manifest-version>` when publishing. Include `assets/icon.png` (PNG, at most 512 KiB) in the artifact.
- Keep version declarations consistent and inspect the package contents before publishing. Include only the bridge, required metadata and user guides.
- Publish only an explicitly reviewed and authorized version from a clean Git tree. Keep npm credentials in private environment configuration and complete the registry's authentication requirements.
- Verify the published artifact before changing installation guidance. npm, plugin marketplaces and the ChatGPT app have separate release lifecycles.
- Preserve the legacy 3.4.0 tag and migration guidance. Do not silently replace existing user connections or change their billing account.

For installation and rollback, see [setup](SETUP.md) and [migration](MIGRATION.md). Earlier user-facing release notes remain in the [legacy source tag](https://github.com/jau123/MeiGen-AI-Design-MCP/tree/v3.4.0).
