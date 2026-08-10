# Slantview Pi Agents

A shareable, security-conscious [Pi](https://pi.dev) setup for multi-agent coding, governed project memory, code intelligence, and current technical research.

This repository packages the useful parts of a working local `~/.pi/agent` installation without publishing authentication state, resolved secrets, sessions, logs, caches, machine-specific paths, or generated indexes.

## What is included

- **11 subagents** — nine security review lenses, a D3 visualization specialist, and a Zikra memory curator.
- **Nine bundled skills** — five local workflows (ADRs, direnv + 1Password, Linear, evidence-backed research, and Zikra memory) plus four reviewed MIT-licensed engineering skills.
- **Two local extensions** — subprocess subagents and native Zikra context/status integration.
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

All MCP output, retrieved memory, indexed code, documentation, and web pages are treated as untrusted data. Zikra and codebase-memory are complementary evidence layers, not automatically synchronized databases.

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

Install from the signed `v0.1.0` release tag rather than mutable default-branch code:

```bash
git clone --branch v0.1.0 --depth 1 https://github.com/slantview/pi-agents.git
cd pi-agents
git verify-tag v0.1.0
./install.sh --dry-run
./install.sh
```

Confirm Git reports a good signature from the expected Slantview maintainer before running either installer command.

The installer:

1. Detects conflicting managed files and stops without changing anything.
2. With `--force`, backs up replaced files under `~/.pi/agent/backups/`.
3. Installs agents and sanitized global guidance.
4. Uses the committed lockfile and `npm ci --ignore-scripts` for reproducible, script-disabled dependencies.
5. Installs this checkout as a local Pi package plus the safe permission profile and MCP template.

Options:

```text
--profile safe|local-parity
--force
--dry-run
--skip-packages
```

After installation, complete the credential setup below and run `/reload` in Pi.

## Credential setup

The default MCP template expects a 1Password item named `LocalEnvironment` in the `Shared` vault. These are field names, not secret values:

| Section | Field |
|---|---|
| `MCP` | `EXA_API_KEY` |
| `MCP` | `FIGMA_API_KEY` |
| `MCP` | `ZIKRA_PI_TOKEN` |
| item root | `CONTEXT7_API_KEY` |
| item root | `GEMINI_API_KEY` |

Create equivalent references or edit `~/.pi/agent/mcp.json` to match your secret manager. Never replace command references with plaintext in a tracked file.

Also define these non-secret paths in your shell environment when using the corresponding servers:

```bash
export FIGMA_IMAGE_DIR="$HOME/path/to/figma-assets"
export MCP_IMAGE_OUTPUT_DIR="$HOME/path/to/generated-images"
```

> `pi-mcp-adapter` gives leading-`!` secret commands 10 seconds to finish. Approve 1Password promptly when a fresh Pi or subagent process connects.

## MCP authentication

- **Tavily and Linear:** browser OAuth; Pi starts the flow when first used.
- **Exa, Context7, Figma, image generation, and Zikra:** secret-manager references in `mcp.json`.
- **codebase-memory-mcp:** local executable on `PATH`; no API key required.
- **Zikra:** use a dedicated developer token, not the owner token.

Check status after reload:

```text
/mcp
```

A read-only agent integration check should be able to call Zikra, codebase-memory, Context7, Exa, and Tavily without exposing credentials.

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
