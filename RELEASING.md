# Releasing MeiGen across channels

A source change is not a publication. Record the source commit, selected version, validation evidence, and result separately for each channel. Never stage, publish, approve, push, or submit an external PR merely because local validation passed.

## Independent release versions

| Channel | Source and version | Release boundary |
|---|---|---|
| npm `meigen` | `package.json`, lockfile, runtime server version | Registry package; MCP configuration pins refer to this version |
| Self-owned Claude marketplace | `.claude-plugin/marketplace.json` entry and `plugin/.claude-plugin/plugin.json` | Keep these two versions equal; they may differ from npm |
| ClawHub standalone Skill `creative-toolkit` | `openclaw/SKILL.md` and `openclaw/references/` | Independent Skill version **3.2.0**; verify publication status |
| ClawHub plugin `meigen-ai-design` | `openclaw-plugin/` + shared Skill sources via `scripts/build-openclaw-plugin.mjs` | Independent plugin version **4.1.0**; remote OAuth, no npm pin |
| `wshobson/agents` | Upstream's `plugins/meigen-ai-design` and marketplace entry | Separate reviewed PR; verify that upstream checkout's packaging and version |
| `meigen-docs` | English and Chinese public documentation | Separate deployment and link/API contract checks |
| Aggregator listings | Each site's listing | Separate submission/update; do not infer completion from GitHub or npm |
| Web/remote MCP | Web deployment | Separate API deployment; refresh the host's remote tool list afterward |

npm **3.1.0** was published as `latest` on 2026-10-12, with matching owned distribution manifests. ClawHub plugin **4.1.0** and standalone Skill **3.2.0** are also published as `latest`; platform scans are clean and all published files match the reviewed sources. Static npm pins follow the verified npm release. Each channel has an independent publication boundary. Read [the migration notes](RELEASE_NOTES_3.0.0.md) before upgrading from 2.x. Before an authorized release, verify the destination's versions and record acceptance separately.

## Validate before requesting a release

Use pnpm and the project's configured Node version. Do not change `engines` as a publishing workaround.

```sh
pnpm typecheck
pnpm test
node scripts/ci/check-frontmatter.mjs
bash scripts/ci/check-versions.sh
bash scripts/ci/check-pinned-npm.sh
pnpm release:dry-run
```

CI first validates package.json against package-lock.json with `npm ci --dry-run --ignore-scripts`, then imports the existing npm lockfile with `pnpm import` and installs using the resulting frozen pnpm lock. A failed locked install is a failure, not permission to fall back to an unlocked install.

`dry-run` runs package packing without registry writes or loading `.env.local`; it bypasses pnpm's clean-tree requirement only for the dry run. `prepack` rebuilds `dist`. Review the file listing: the package allowlist is `bin`, `dist`, `SETUP.md`, `SETUP.zh-CN.md`, `RELEASE_NOTES_3.0.0.md`, `RELEASE_NOTES_3.1.0.md`, `SKILLS_API.md`, `COMPOSABLE_WORKFLOWS.md`, `COMPOSABLE_WORKFLOWS.zh-CN.md`, and `MCP_AUTH_AND_RESULTS.md`, plus standard package metadata/docs. Secrets, private npm config, tests, and unrelated worktree files must stay out. A local dry run does not prove registry authentication, available version, or publishing rights.

For a release involving both repositories, explicitly run this additional check with the actual Web checkout path:

```sh
node scripts/ci/check-guidance-sync.mjs /path/to/meigen-web --published
```

It compares npm `src/lib/skill-guidance.ts` with Web `src/lib/skills/mcp-guidance.ts` and checks the Web npm pin. It is intentionally not a default CI requirement: an independent npm clone does not need a sibling Web checkout. Both repositories still need their own tests and deployment review.

## No-key host smoke checks

Use temporary Claude/OpenClaw state directories and no credentials; do not modify the operator's installed plugins. Read CLI help for the installed version before selecting state-directory options. Do not log in or start paid generations.

- Claude: `claude plugin validate ./plugin`, then inspect `claude --plugin-dir ./plugin plugin details meigen`. Also install the local marketplace into the isolated state and inspect it. The local CLI **2.1.241** passed both validations on 2026-09-14. Expect one bundled MCP server, named `meigen`; do not add a duplicate manually.
- OpenClaw: build a fresh bundle with `node scripts/build-openclaw-plugin.mjs <new-temp-directory>`, then install it in isolated state. Preserve installed ID **meigen** and distribution ID **meigen-ai-design**. The dedicated directory is a compatible Claude-format content/MCP bundle, with matching registry metadata and no Claude hooks. Verify one remote Streamable HTTP server with OAuth and all four Skill guides. Check with the current release (2026.9.9 at preparation).
- Save the same remote server using `openclaw mcp add` before login: login only reads persisted MCP entries. Confirm that a second add fails without changing the configuration. Existing saved stdio/BYOK configurations override the bundle and must not be automatically migrated.
- Standalone ClawHub Skill: it supplies guidance only, with modern `metadata.openclaw` and no hard dependency on mcporter/npx/node. Do not install both the standalone Skill and its bundled copy.

- npm: verify the packed artifact's tool inventory and no-key public discovery; test auth rejection without sending a real secret. For this source update, expect 17 local tools and 22 remote tools after the matching API deployment. The 3.1.0 pins are release-candidate configuration; verify npm availability before directing users to install them. Local additions are `enhance_prompt` and `manage_preferences`; the five private-library tools are remote OAuth only and must be absent from stdio, even with a configured API key.

Report install/manifest inspection separately from successfully connected MCP tools and real generation. A host's unavailable or outdated CLI is a verification boundary, not evidence that an advertised channel works.

## Credentials and staged npm publishing

Keep `NPM_TOKEN` in this repository's ignored `.env.local` or private process environment. It must be an npm credential, not a `meigen_sk_` key. Never paste it into chat, check it into Git, ship it in the package, or configure it in the Web application. `.npmrc.release` contains the literal `${NPM_TOKEN}` reference; credentialed helper modes explicitly select that file. `check` loads private credentials and runs read-only `npm whoami`; it verifies identity, not every permission.

```sh
pnpm release:check
```

After explicit authorization to upload a staged package, use the stage-only mode:

```sh
node scripts/release.mjs stage
```

It runs `npm stage publish`, requires a clean Git tree and a CLI that supports staging, and never falls back to direct publishing. Staging writes a package to the registry and reserves that version; it is not a dry run. Record the returned stage ID. A maintainer can inspect the staged artifact and, only with separate publication approval, approve it using npm's normal 2FA flow. See [npm staged publishing](https://docs.npmjs.com/cli/v11/commands/npm-stage/). The helper never auto-approves a stage or weakens account settings.

`pnpm release:publish` remains an explicit direct-publication mode for an authorized workflow; it retains Git checks. Do not use it as a fallback when staging/authentication fails. Check the registry version and installed artifact after any authorized publication.

## Deployment and distribution order

Deploy the reviewed Web APIs first: the durable ordinary-generation request contract on `POST /api/generate/v2`, authenticated `GET /api/generate/v2/requests/{requestId}`, structured remote MCP tools, and the five Skill APIs including `upscale_image`. Verify exact-ID replay, transient in-progress 503 (including npm 1.4.0 key retention), changed-input 409, request lookup after key rotation, 402 recovery, the reference video/audio arrays and the remote catalog before distributing npm 3.1.0. Explicit local requestId calls (including wait=false) and requestId recovery depend on this endpoint. Deploying npm ahead of the matching backend blocks those calls with endpoint_unavailable / check_backend; an HTML or unrecognized JSON 404 never permits automatic submission. Known generationId status still uses the existing status endpoint. This release depends on the generation worker admission migration kept in the Web repo (`scripts/release/generation-worker-admission.sql`: the `generations.processing_claim_token` column plus the `claim_generation_worker` / `fail_generation_admission` RPCs; applied to production on 2026-09-17). Apply it to any other environment before deploying that environment's Web backend — the new `/process` refuses to run without it. It does not re-enable a global generation quota.

A backend rollback must retain the compatible request-recovery and durable POST contracts. If a route becomes unavailable, restore it and verify existing IDs before resuming affected workflows. Preserve caller IDs and local receipts; do not treat a missing route as a missing job or ask every user to withdraw an already installed npm package. Include HTML/unknown-JSON 404 (zero paid POST), structured request_not_found, bounded observation retries/cancellation, and completed media-mismatch results in release smoke checks.

Then, after authorization for each channel, release npm, update the self-owned Claude marketplace and chosen ClawHub artifacts, submit the separate wshobson PR, deploy bilingual `meigen-docs`, and update requested aggregators. Pins can be prepared before publication, but users must not be told an unpublished version is installable. Verify live availability at each step and record remaining channels instead of reporting one overall "published" status.

Official packaging references: [Claude plugin MCP configuration](https://code.claude.com/docs/en/plugins-reference), [OpenClaw native MCP declarations](https://docs.openclaw.ai/plugins/manifest/surfaces), [OpenClaw bundle compatibility](https://docs.openclaw.ai/plugins/bundles).

Standalone API image preparation requires a positive purchased-credit balance (upload itself does not charge). Upscale run additionally checks the selected live model, accepted initial price and full eligible balance before preprocessing, then rechecks price before dispatch. Session crisp retains daily credits; API calls use purchased credits only. All-channel Upscale preprocessing uses the existing 1,000-per-day ceiling and a per-instance two-operation memory guard. These are not a distributed byte budget or a charge for uploads. Both MCP Upscale schemas require `confirmedCredits` on the first call as well as retries; refresh cached tool schemas. Ship the matching App resize-confirmation UI: older App versions encountering oversized originals are told to update or confirm through the Web, without silently accepting resizing. Unlimited remains disabled; its legacy RPC bypass is tracked separately and is not part of this release.

The 3.1.0 release allowlist also includes `MCP_AUTH_AND_RESULTS.md` and `RELEASE_NOTES_3.0.0.md`. CI uses Node 24 (the project runtime). Update deployed installation guidance only after registry verification. For this release, the active Web npm pin is in `src/lib/skills/mcp-guidance.ts`; search current sources rather than assuming older landing-page version fields still exist.

Historical ClawHub branding update (2026-09-27): the standalone Skill and bundle plugin use display name **MeiGen** and distribution version **2.0.3**. Their install identifiers remain `creative-toolkit` and `meigen-ai-design`; the runtime stayed pinned to npm version 2.0.2 at that time. This patch changes presentation only and requires no npm release. Verify each registry publication separately.

The account-library release depends on `/api/library/favorites`, `/api/library/boards`, `/api/library/history` and `/api/library/item`, plus OAuth library consent and explicit rejection of API keys. Verify API-key rejection and OAuth access boundaries, large Unicode prompt pagination, favorites quota enforcement, idempotent saves, and private-board enforcement before publishing clients. The backend database functions remain a separately approved deployment prerequisite. ComfyUI and bundled prompt data are removed; user-owned workflow files are not deleted or migrated.

## OpenClaw 4.1 / Skill 3.2 distribution

Publish these distribution artifacts separately from npm/Claude 3.1.0. 4.0 changes the ClawHub plugin's default connection from local npm/stdio to remote OAuth; include the migration notice in the release notes. Keep old versions available to users retaining local capabilities.

Build once into a new temporary directory outside the repository. Validate that exact directory with `pnpm dlx clawhub@0.23.3 package validate <directory> --out <absolute-report-directory-outside-artifact> --json` and a real isolated OpenClaw install. Run `node --test scripts/ci/openclaw-package.test.mjs`, frontmatter and version checks. No credentials or configuration files belong in the artifact.

Publish the bundle with `clawhub package publish <directory> --family bundle-plugin --bundle-format claude --host-targets openclaw --name meigen-ai-design --display-name MeiGen --owner jau123 --version 4.1.0 --tags latest --wait --json` and the standalone Skill with `clawhub skill publish ./openclaw --slug creative-toolkit --name MeiGen --owner jau123 --version 3.2.0 --tags latest --json`; supply a meaningful changelog and inspect `--dry-run` first. Use the current CLI, not the older global binary. Do not attach an old Git commit as provenance for uncommitted files.

After publication, read registry version/security state and download each exact version to compare its files against the validated artifact. Installation/Inspector success does not prove private OAuth access; record discovery, consent, tool access and revocation separately. A production account acceptance run requires the user's permission and no paid generation.

ClawHub CLI 0.23.3 requires `openclaw.plugin.json` even for bundle publication. Keep that catalog manifest aligned with `.claude-plugin/plugin.json` (runtime ID `meigen`) and `.mcp.json`; the packaging test enforces this. OpenClaw 2026.9.9 actually loads the directory as a Claude-format content/MCP bundle, despite documentation suggesting native-marker precedence. Do not claim a native JavaScript runtime or rely on detection without a real installation check.

Acceptance on 2026-10-10: OpenClaw 2026.9.9 installed the candidate as bundle ID `meigen`, with one HTTP MCP server and four eligible Skill guides. Inspector reported zero issues or warnings. Real OpenClaw OAuth completed; its session MCP runtime listed 19 tools, called `list_skills`, and read one favorite. No generation/upload/save was performed. The temporary authorization was revoked in MeiGen and local OAuth credentials were cleared. Re-adding an existing server failed and left configuration bytes unchanged. Web/docs deployment and Git delivery are separate from ClawHub publication.

Use an **absolute** Inspector output path outside the bundle. The CLI resolves relative `--out` paths inside the artifact directory. Run `node scripts/ci/check-openclaw-artifact.mjs <bundle-directory>` after validation and before publication; never ship generated Inspector reports. The 4.0.1 packaging patch removes the three generated reports included in 4.0.0; runtime behavior is unchanged.

Publication verified on 2026-10-10: ClawHub `meigen-ai-design@4.0.1` and standalone `creative-toolkit@3.1.0` are both published as `latest`. Downloaded artifacts matched the reviewed files byte for byte (12 bundle files, three standalone Skill files). A fresh isolated OpenClaw 2026.9.9 installation using the unversioned `clawhub:meigen-ai-design` command resolved 4.0.1 and reported a Safe audit. Bundle ZIP SHA-256: `97bbf94b7e8ae38feb79c11fe9f112c3750c3e7d9bf8c16e27142f9b1329e193`. npm remains 3.0.0; these registry publications do not deploy the Web or docs changes.

Current candidate gates: [3.1.0 release notes](RELEASE_NOTES_3.1.0.md#release-gates).


## 2026-10-12 publication evidence

npm `meigen@3.1.0` SHA-1: `eab19f529e88188fe6f3dcd3a9993b5b041e2ce7`. The actual packed server exposed 17 tools through the SDK; `list_skills` succeeded without credentials. The remote services expose 22 tools. OpenAI Platform rescanning confirmed 22 Live tools and no findings; store 1.1.0 metadata remains In review. Live tool discovery and consent are separate from that store review.

ClawHub bundle 4.1.0 ZIP SHA-256: `60115f69713eac5361ec02fa0a5f14dd0dee573bdf1c8bfd4b5cce479e248645`; downloaded ZIP contents match all 12 local artifact files. Standalone Skill 3.2.0 registry digests match its three source files. OpenClaw structural inspection passed; no fresh authenticated OpenClaw session was tested for this release.

The GitHub README was corrected after publication to reflect current ChatGPT library availability. The immutable 3.1.0 npm tarball retains its earlier README availability note; do not repack or replace a released version for a documentation-only correction. Use the current GitHub README and deployed docs for client availability.


## 2026-10-14 HeyGen reference-video release

npm `meigen@3.1.1` is published as `latest`. Runtime source commit: `093095bd9c658296d4e50974132324ebc38d5a77`; published SHA-1: `a07a5ae0c91ebd87d1de6a993888c28dc85ad52f`. The staged tarball was downloaded and all 148 runtime files matched the local build; SDK discovery reported version 3.1.1, 17 tools, and successful public model discovery. Linux and Windows CI passed.

The patch fixes HeyGen per-clip versus aggregate reference limits and rejects incompatible video/audio inputs before a new paid submission. Existing stdio clients must update their pinned npm version and reconnect. Remote MCP uses the independently deployed Web backend. Distribution versions remain independent; no new ClawHub publication is implied.


## 2026-10-15 Seedance draft release

npm `meigen@3.2.0` is published as `latest`. Runtime source commit: `81da28d`; published SHA-1: `f529cc3eb0cf3986ddc9e17b38a3990ae9fd16e9`. The public tarball is byte-identical to the reviewed staged artifact; all 163 packaged files were checked. SDK discovery reported version 3.2.0 and 18 local tools, including `render_video_draft`; public model discovery passed without credentials. Private-library and saved-character tools remain remote OAuth only.

Type checking, 246 tests, version/frontmatter checks, lockfile validation and release dry-run passed. Cross-repository guidance matches the published npm version. No paid draft-to-final generation was performed. Existing stdio users must update their package pin and restart/reconnect; hosted MCP deployment and ClawHub publications are independent.
