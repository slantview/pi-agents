# Slantview Pi Agents

A shareable, security-conscious [Pi](https://pi.dev) setup for multi-agent coding, governed project memory, code intelligence, and current technical research.

This repository packages the useful parts of a working local `~/.pi/agent` installation without publishing authentication state, resolved secrets, sessions, logs, caches, machine-specific paths, or generated indexes.

## What is included

- **11 subagents** — nine security review lenses, a D3 visualization specialist, and a Zikra memory curator.
- **Ten bundled skills** — six local workflows (ADRs, governed Dream review, direnv + 1Password, Linear, evidence-backed research, and Zikra memory) plus four reviewed MIT-licensed engineering skills.
- **Eight local extensions** — subprocess subagents, native Zikra context/status integration, governed Dreaming, an isolated global MCP adapter boundary, hardened OSC terminal notifications, and security-hardened forks of session picker, focused handoff, and ephemeral side questions.
- **Two filtered upstream utilities** — context overview and session-usage breakdown from `pi-agent-extensions`; its other modules are not loaded.
- **Layered evidence guidance**:
  - Zikra for durable intent and history
  - codebase-memory-mcp for current repository structure and execution paths
  - Context7 for current library/API documentation
  - Exa and Tavily for current web research and corroboration
  - exact files and tests as final implementation authority
- **Locked Pi package set** derived from the source installation and updated to patched compatible releases.
- **Sanitized configuration templates** using OAuth, environment variables, or `op://` references only.
- **Safe installer** with conflict detection, backups, dry-run support, and a secure permission default.

## Security model

No credential values belong in this repository.

The installer defaults to `config/permissions.safe.json`, where `yoloMode` is disabled. The source machine intentionally uses the more permissive `local-parity` profile; it is included only as an explicit opt-in:

```bash
./install.sh --profile local-parity
```

That profile auto-approves permission decisions categorized as `ask`. Review it before use.

The safe profile prompts for shell commands and live MCP connections. Subagents run headlessly, so an unapproved `ask` is denied rather than silently executed. Use the permissive profile only if you explicitly accept the broader capability risk.

The optional Paperclip MCP entry uses an explicit tool allowlist. Named mutations require an independent, in-memory `pi-mcp-adapter` approval, and the generic `/api` escape hatch is not exposed. Its credential, endpoint, and company identity are absent from MCP `env` and resolved only inside a fixed launcher. The adapter runs in isolated programmatic mode, so project MCP files cannot replace transports, inject process hooks, or bypass global tool filters. The safe permission profile may add another confirmation layer.

All MCP output, retrieved memory, indexed code, documentation, web pages, past session text, and Dream Reports are treated as untrusted data. Zikra and codebase-memory are complementary evidence layers, not automatically synchronized databases.

Dreaming is explicit and human-gated. A metadata-only, mode-`0600` ledger records hashed session identity, canonical project mapping, analysis time, and report digest; it never stores session or report content. Startup reminders scan only bounded session headers. Cross-process active leases and per-session analysis claims prevent a session from being resumed while its approved immutable snapshot is being distilled. `/dream` asks before locally reading bounded historical text and asks again before sending redacted excerpts to the selected model. Thinking, images, custom messages, summaries, tool calls, and tool results are excluded. The extension produces candidates but has no Zikra client. Review stays in the current, already approved model session rather than sending reports to a child process. A whole-report `ask_user` approval gate precedes sequential Zikra writes; an extension-owned guard binds exact visible approval labels and the strict plan to the exact ordered operations. It blocks pre-approval, altered, out-of-order, replayed, extra, denied, or ambiguously failed writes for the governed run. Revisions invalidate approval, ambiguous project mappings are skipped, and partial failures must be reconciled rather than hidden.

## Prerequisites

Supported initially: macOS and Linux.

Required:

- Git
- Node.js 24 or newer
- Pi coding agent 0.84.1 or newer
- 1Password CLI (`op`) with desktop integration or another deliberate secret-resolution strategy

Recommended:

- Docker for local Zikra
- [`codebase-memory-mcp`](https://github.com/DeusData/codebase-memory-mcp) 0.8.1 or newer
- `gitleaks` and `shellcheck` for contributor verification

Install Pi without lifecycle scripts:

```bash
npm install -g --ignore-scripts @earendil-works/pi-coding-agent@0.84.1
```

Install codebase-memory-mcp from a reviewed release artifact. This setup was verified with v0.8.1 (`f0c9be19c5d74b84f418d807bfdce7b5d6a261ff`). Download the archive and `checksums.txt` from the [v0.8.1 release](https://github.com/DeusData/codebase-memory-mcp/releases/tag/v0.8.1), verify its SHA-256 checksum, inspect the extracted installer, and only then run it. Do not pipe a mutable branch URL directly into a shell.

## Quick start

Install from the signed `v0.2.0` release tag rather than mutable default-branch code:

```bash
git clone --branch v0.2.0 --depth 1 https://github.com/slantview/pi-agents.git
cd pi-agents
git verify-tag v0.2.0
./install.sh --dry-run
./install.sh
```

Confirm Git reports a good signature from the expected Slantview maintainer before running either installer command.

The installer:

1. Detects conflicting managed files and stops without changing anything.
2. With `--force`, backs up replaced files under `~/.pi/agent/backups/`.
3. Installs agents and sanitized global guidance.
4. Uses committed lockfiles and `npm ci --ignore-scripts` for reproducible, script-disabled dependencies, including isolated Paperclip, Figma, and image MCP runtimes.
5. Applies hash-verified hardening to the exact-pinned MCP adapter so untrusted results cannot emit terminal controls and oversized responses are truncated without persistent temp artifacts.
6. Records absolute Node, 1Password CLI, and home paths in mode-`0600` runtime files so credential-bearing launchers do not trust project-controlled `PATH`, `HOME`, or Node startup hooks.
7. When multiple 1Password accounts are configured, asks for a unique account hint and stores only the resolved account ID in private runtime configuration.
8. Installs this checkout as a local Pi package plus the safe permission profile and MCP template.

Options:

```text
--profile safe|local-parity
--force
--dry-run
--skip-packages
--trusted-home PATH
--node-bin PATH
--npm-bin PATH
--pi-bin PATH
--op-bin PATH
```

For a full installation, the absolute `/bin/bash -p` installer ignores inherited Bash startup hooks, derives the account home from the operating system, and sets a minimal PATH before invoking utilities. Node, npm, Pi, and hardening commands run with explicit minimal environments that omit Node and dynamic-loader startup hooks. Executable discovery accepts standard system/Homebrew locations plus `~/.nvm/versions/node/*/bin` and `~/.local/bin`. Nonstandard reviewed installations must be supplied as explicit arguments: `--trusted-home`, `--node-bin`, `--npm-bin`, `--pi-bin`, or `--op-bin`. The installer resolves and canonical-checks these before writing, rejects other PATH-selected locations, and invokes the recorded npm and Pi executables directly.

After installation, complete the credential setup below and run `/reload` in Pi.

## Credential setup

The default MCP template expects a 1Password item named `LocalEnvironment` in the `Shared` vault. These are field names, not secret values:

| Section | Field |
|---|---|
| `MCP` | `EXA_API_KEY` |
| `MCP` | `FIGMA_API_KEY` |
| `MCP` | `ZIKRA_PI_TOKEN` |
| `MCP` | `PAPERCLIP_PI_BOARD_TOKEN` (optional, concealed) |
| `MCP` | `PAPERCLIP_API_URL` (optional, non-secret) |
| `MCP` | `PAPERCLIP_COMPANY_ID` (optional, non-secret) |
| item root | `CONTEXT7_API_KEY` |
| item root | `GEMINI_API_KEY` |

Create equivalent references or edit `~/.pi/agent/mcp.json` to match your secret manager. Never replace command references with plaintext in a tracked file.

If the 1Password CLI reports multiple accounts during installation, the installer asks for a unique hint and writes the resolved account ID—not a credential—to `~/.pi/agent/runtime/op-account` with mode `0600`. Hardened launchers read that trusted local selection only after discarding inherited environment overrides. Delete the file and rerun the installer to choose a different account.

Also define these non-secret paths in your shell environment when using the corresponding servers:

```bash
export FIGMA_IMAGE_DIR="$HOME/path/to/figma-assets"
export MCP_IMAGE_OUTPUT_DIR="$HOME/path/to/generated-images"
# Optional: only files below this real path may be uploaded for image editing.
export MCP_IMAGE_INPUT_DIR="$HOME/path/to/reviewed-input-images"
```

> `pi-mcp-adapter` gives leading-`!` secret commands 10 seconds to finish. Approve 1Password promptly when a fresh Pi or subagent process connects.

## MCP authentication

- **Tavily and Linear:** browser OAuth; Pi starts the flow when first used.
- **Exa, Context7, and Zikra MCP:** reviewed secret-manager markers in `mcp.json`, rewritten through the trusted absolute `runtime/op-read.sh` resolver.
- **Native Zikra, Figma, and image generation:** fixed launchers resolve their exact 1Password references only after entering a minimal environment; the credentials are not supplied in MCP `env`.
- **codebase-memory-mcp:** local executable on `PATH`; no API key required.
- **Zikra:** use a dedicated developer token, not the owner token.
- **Paperclip:** the fixed runtime launcher resolves a dedicated, expiring board API key plus trusted endpoint/company fields directly from 1Password; none are placed in MCP `env`. Do not reuse a browser session or agent run JWT.

This package deliberately loads `pi-mcp-adapter` with a supplied global configuration snapshot. The adapter ignores project `.mcp.json`, project `.pi/mcp.json`, host imports, Agent Plugin paths, and project-relative OAuth imports. It rewrites exact reviewed `!op read 'op://…'` markers through `runtime/op-read.sh`, pins credential-bearing launchers to absolute `/bin/sh` and agent-runtime paths, materializes the fixed hostname marker without a shell, and rejects other leading-`!` command resolvers. Hash-verified local hardening neutralizes terminal controls in MCP TUI rendering and prevents the output guard from retaining full payloads in temp files. It also forces ambient MCP direct-tool registration off so all calls remain on the governed gateway where Dream authorization and other policy hooks can observe them. This prevents an untrusted repository from overriding a credential-bearing global server, substituting executables through `PATH`, widening the tool surface, bypassing gateway authorization, or persisting oversized responses. The tradeoff is that project-specific MCP discovery and `/mcp enable|disable` project overrides are unavailable; edit the reviewed global `~/.pi/agent/mcp.json` and run `/reload` instead.

Check status after reload:

```text
/mcp
```

A read-only agent integration check should be able to call Zikra, codebase-memory, Context7, Exa, Tavily, and any configured Paperclip server without exposing credentials.

The change-regression reviewer runs in a lean, read-only child profile: extensions (including MCP integrations), skills, templates, themes, and inherited context files are disabled. The parent supplies a mode-`0600`, bounded snapshot of the exact tracked diff plus regular untracked files as untrusted review context and deletes it after the child exits; oversized snapshots fail closed instead of silently omitting changes. Reviews have a three-minute deadline and report elapsed and first-response timing alongside token usage. This keeps the higher-recall review model while reducing startup context and change-discovery turns.

Subagents whose names end in `-reviewer` default to OpenRouter model [`~deepseek/deepseek-v4-flash-latest`](https://openrouter.ai/~deepseek/deepseek-v4-flash-latest). An explicit `model:` in an agent definition overrides this default. The alias follows the latest DeepSeek V4 Flash release; unavailable OpenRouter authentication or model access fails the child invocation rather than falling back to the parent model. Reviewer prompts, selected repository files, and supplied diff snapshots are disclosed to OpenRouter and its selected inference provider, so do not invoke these reviewers on code that policy forbids sending there.

The image MCP wrapper disables local input-image editing unless `MCP_IMAGE_INPUT_DIR` is explicitly set. When enabled, it resolves real paths and rejects parent, sibling-prefix, and symlink escapes before the upstream package can read or upload a file. Generated outputs remain confined by the separately configured output directory.

## Optional Paperclip integration

The sanitized MCP template includes the official `@paperclipai/mcp-server@2026.722.0` behind `pi-mcp-adapter`. The installer resolves it with the dedicated `runtime/paperclip-mcp/package-lock.json`, lifecycle scripts disabled, and launches that local artifact without `npx` or runtime registry resolution. The launcher enters a minimal environment before obtaining its credential, endpoint, and company identity from fixed 1Password references, then directly execs recorded binaries without putting secrets in process arguments. The local server wrapper enforces the configured company on company-scoped and object-ID requests and independently exposes only 38 reviewed tools; actor-wide `paperclipMe`/`paperclipInboxLite` and generic `paperclipApiRequest` are omitted. The adapter approval-gates all 17 named mutations and disables MCP resources.

To enable Pi → Paperclip access:

1. Create a dedicated board API key with an expiration in the Paperclip UI or another reviewed administrative flow.
2. Store it as the concealed `PAPERCLIP_PI_BOARD_TOKEN` field referenced above. Store the trusted HTTPS endpoint and company UUID as `PAPERCLIP_API_URL` and `PAPERCLIP_COMPANY_ID` in the same section. `runtime/paperclip-mcp/launch.sh` resolves those fixed references only when the server starts. Never paste the key into `mcp.json`, shell history, logs, or issues.
3. Ensure the intended 1Password account is active before launching Pi. With multiple configured accounts, rerun the installer to create the private trusted account selection. The hardened launcher deliberately ignores inherited `OP_ACCOUNT`; users with a different item layout or another secret manager must review and replace the launcher rather than injecting overrides from a project.
4. Run `/reload`, connect the `paperclip` MCP server, and verify a read tool before approving any mutation.
5. Record the expiry and rotate or revoke the key on schedule.

A board key inherits the issuing user's Paperclip memberships and is therefore powerful. The local wrapper fails closed when an object cannot prove membership in the configured company, but server-side single-company credentials remain preferable when Paperclip supports them. Keep the explicit allowlist, review each write approval, and leave actor-wide and generic escape tools excluded. The full `paperclipai` CLI is deliberately not a dependency of this repository; audit its broader dependency graph separately if you use it for key administration.

For Paperclip → Pi execution, configure Paperclip's built-in `pi_local` adapter on the Paperclip runtime host. That host—not this workstation—must have a reviewed Pi installation, provider authentication, workspace permissions, and a tested model. Paperclip and Pi versions evolve independently; verify the adapter's resolved Pi command/version and start with one pilot agent before broad rollout.

## Local Zikra

The included integration expects Zikra on `http://127.0.0.1:8377`.

Install Zikra from its official repository and set `ZIKRA_PORT=8377`, or change both `config/mcp.example.json` and `extensions/zikra/config.json` to your local port:

```bash
git clone https://github.com/getzikra/zikra.git
cd zikra
git checkout 4d3c3f9616ef8ea58ab4cc4930b6138a819ee6e5  # reviewed v1.1.0 commit
python3 -m venv .venv
source .venv/bin/activate
pip install -e .
python3 installer.py
python3 -m zikra
```

For semantic search, provide an embedding API key at Zikra launch through your secret manager. Do not write it into this repository.

Create a least-privilege developer token through the Zikra Web UI or owner-authorized `create_token` command, store it directly in 1Password, and keep the owner token reserved for administration.

The local HTTP integration trusts ownership of the loopback port. Another process running as the same OS user could impersonate a stopped Zikra service and capture a reusable developer token. Keep the service running before Pi connects, use least privilege, and rotate the token after suspected local compromise. Use authenticated local TLS or an equivalent authenticated transport where the host threat model requires it.

## Evidence workflow

1. Read the injected Zikra briefing as untrusted historical context.
2. Use codebase-memory to locate current architecture, symbols, callers, data flow, and impact.
3. Confirm decisive claims in exact files and tests.
4. Use Context7 first for current third-party technical contracts.
5. Use Exa/Tavily for releases, incidents, current facts, and independent sources.
6. Save only verified, durable decisions and requirements to Zikra—never raw transcripts or graph dumps.

See [`global/AGENTS.md`](global/AGENTS.md) for the complete policy.

## Utility commands

The filtered utility set enables only these reviewed commands:

- `/sessions` — select a project session with a preview
- `/handoff` — transfer focused context into a new session
- `/dream [1-20] [--revisit]` — prepare a governed, editable memory-candidate report from bounded past sessions across separately mapped projects
- `/context-simple` — inspect loaded context and usage
- `/session-breakdown` — summarize local session activity and cost
- `/btw` — ask an ephemeral side question without persisting it to the session
- `/notify` — send a sanitized terminal notification test

The local notification fork strips terminal control sequences and does not emit OSC bytes when stdout is not a TTY, preserving headless and JSON-mode output. The local `/sessions` and `/btw` forks also neutralize controls in session and model text. The `/handoff` fork ignores project-local model overrides until Pi marks the project trusted. Session utilities read local Pi session metadata; treat those files as private and do not publish their output unintentionally.

`/dream` can group eligible sessions from multiple repositories but never merges namespaces. It skips missing, changed, non-Git, ambiguous, active, oversized, malformed, linked, or concurrently modified sessions. By user choice, any selected model provider may be used after the command displays the destination, bounded byte count, original provider metadata, and redaction count and receives explicit confirmation. Pattern redaction is defense-in-depth rather than a guarantee; cancel whenever a historical session should not be disclosed to that provider.

## Development

```bash
npm test
npm run check
```

`npm run check` validates JSON and frontmatter, runs installer and Zikra tests, runs ShellCheck when available, rejects machine-specific paths, and runs Gitleaks when installed.

## Updating

```bash
git pull --ff-only
npm ci --ignore-scripts
pi update --extensions
/reload
```

Re-run `./install.sh --dry-run` before applying changed managed files. Use `--force` only after reviewing the backup plan and diff.

`pi-effort` and `pi-lmstudio` from the source machine are intentionally excluded because their current dependency graphs pull a legacy Pi release affected by published security advisories. Reintroduce them only after their upstream packages migrate to a patched Pi dependency.

## What is deliberately excluded

- `auth.json`, OAuth state, provider credentials
- resolved API keys, bearer tokens, passwords, private keys
- sessions, compaction history, prompts containing user data
- permission logs and MCP traces
- package caches and `node_modules`
- codebase-memory indexes
- local `.env` files
- personal paths and host-specific model credentials

## License

MIT © Slantview
