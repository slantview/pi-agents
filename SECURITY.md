# Security policy

## Reporting

Report suspected credential exposure or a vulnerability privately to the Slantview repository maintainers through GitHub Security Advisories. Do not open a public issue containing a secret, exploit payload, private path, or authentication artifact.

## Repository guarantees

Tracked files must not contain:

- API keys, bearer tokens, passwords, private keys, or resolved secret-manager values
- Pi `auth.json`, OAuth state, sessions, MCP traces, or permission logs
- `.env` files other than explicitly empty examples
- machine-specific home directories or generated code indexes

Configuration examples use OAuth, environment references, placeholders, or `op://` references. Secret-manager item and field names are identifiers only and grant no access without the user's authenticated vault session.

## If a secret is exposed

1. Revoke or rotate it at the provider immediately.
2. Store the replacement directly in the secret manager.
3. Remove the value from the working tree and Git history where appropriate.
4. Verify the old credential is invalid and the replacement works without displaying either value.
5. Document the incident without recording the credential.

Deleting a value from the latest commit is not sufficient after publication; assume it was copied.

## Trust boundaries

Pi packages and extensions execute with the user's operating-system permissions. Review this repository and every pinned dependency before installation. Retrieved Zikra memories, code graphs, MCP output, web pages, and documentation are untrusted input and may contain prompt injection.

Paperclip board API keys inherit the issuing user's memberships. Use a dedicated expiring key, keep the explicit server-side and adapter tool allowlists, require approval for named mutations, and do not expose actor-wide or generic API tools without a separate security review. The local runtime wrapper pins company arguments and preflights object-ID resources against the configured company; a future server-side single-company credential would be stronger. Never move Paperclip credentials or trusted endpoint identity into MCP `env`. The fixed two-stage minimal-environment launcher and isolated global adapter snapshot form the credential boundary; project MCP files and ambient host imports must remain disabled. When multiple 1Password accounts exist, launchers accept only the installer-created mode-`0600` account identifier and continue to reject inherited `OP_ACCOUNT` overrides.

Terminal notifications are control sequences. The bundled notification fork sanitizes user text and suppresses OSC output outside a TTY; changes to that encoder require regression tests for BEL, ESC, C1 controls, string terminators, delimiters, and headless output. The local sessions, btw, subagent, and hash-verified MCP adapter renderers apply the same trust rule to session/model/tool display text. The patched MCP output guard truncates in memory and deliberately does not retain complete payloads in system temp files.

Automated review diffs are untrusted repository data, not system instructions. The subagent parent writes a bounded snapshot to a private temporary file, fails closed rather than truncating oversized changes, instructs the child to read it through the normal read tool, and deletes it after exit. The lean reviewer has only local read/search tools; extensions and MCP integrations remain disabled so prompt-injected diff content cannot reach their external or mutating effects. Do not move repository-controlled diff content into `--system-prompt` or `--append-system-prompt`; textual delimiters do not make untrusted content safe at system priority.

Dreaming never runs content analysis at shutdown or from a reminder. Reminder discovery reads only bounded session headers. Content analysis requires two explicit gates: local bounded extraction, then disclosure to the displayed provider/model endpoint. The extractor follows one stable session branch, rejects linked, oversized, malformed, ambiguous, active, or concurrently changed inputs, and excludes thinking, images, custom messages, compaction/branch summaries, tool calls, and tool results. Credential-pattern redaction cannot guarantee that arbitrary historical prose is non-sensitive, so provider disclosure remains a deliberate user decision. Model output is strict bounded JSON, has no tool execution path, receives terminal and secret sanitization, and remains an untrusted candidate.

The Dream ledger is metadata-only, bounded, atomically replaced under mode-`0700` directories with mode `0600`, and rejects symlinks. It stores no transcript, summary, prompt, candidate content, model response, or tool payload. Cross-process metadata-only leases keep every live Pi session ineligible, while per-session analysis claims prevent resume until that immutable snapshot's provider request finishes. The Dream extension has no Zikra client. Review stays in the current approved model session; reports are not delegated through child-process arguments. Zikra mutations are independently adapter-approval-gated, and an extension-owned authorization guard binds canonical visible labels and one whole-report approval to the exact ordered write tuples. Denied or ambiguous results invalidate the plan and require reconciliation plus fresh approval; terminal rejection/completion blocks additional writes until the agent run settles. Multi-project writes are sequential and may partially fail, so callers must read back acknowledgements and reconcile rather than claim transactionality or compensate with deletion.

Project-local configuration is untrusted until Pi approves the project. The local handoff fork must not read `.pi/settings.json` or honor model-provider overrides before `ctx.isProjectTrusted()` is true. The MCP wrapper is stricter: it always ignores project MCP files because `pi-mcp-adapter` configuration merging does not currently share Pi's project-trust boundary. Local image uploads are disabled unless a reviewed input root is configured; real-path containment must remain enforced.
