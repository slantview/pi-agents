# Governed Dreaming for durable project memory

## Status

Accepted

## Date

2026-08-11

## Context and Problem Statement

Past Pi sessions contain useful decisions, requirements, confirmed errors, and architecture findings that may never reach durable project memory. Automatically retaining transcripts or generated summaries would create a secondary store of sensitive session content, conflict with metadata-only shutdown logging, and make prompt injection or hallucination durable.

The system needs a repeatable consolidation workflow that can examine past sessions while preserving project isolation, explicit disclosure consent, evidence review, and human control over Zikra mutations.

## Decision Drivers

- No automatic transcript-derived persistence or shutdown model calls.
- No raw sessions, thinking, tool payloads, summaries, credentials, personal data, or local paths in Zikra.
- Historical sessions from different repositories must never be merged into one namespace.
- Session and model output are untrusted input.
- Users need a useful multi-project workflow rather than one-project-at-a-time manual copying.
- Zikra v1.1 does not provide a transactional multi-project batch write.
- The safe and local-parity permission profiles must not be the only control protecting Zikra mutations.

## Considered Options

### Automatic content digest at session shutdown

Rejected. It creates derived-content retention before consent, conflicts with the metadata-only shutdown boundary, and requires a separate encryption, retention, recovery, and deletion design.

### Manual command only

Not selected. It is safest but makes the feature easy to forget.

### Manual command with metadata-only reminder

Selected. Startup may inspect bounded session headers and a private metadata ledger, but it cannot read message content or call a model. The user explicitly invokes `/dream` for content analysis.

### Current project only

Not selected. It provides simpler verification but does not support organization-wide learning.

### All projects grouped by immutable namespace

Selected. Eligible sessions may come from multiple repositories, but trusted code assigns each group to one canonical Zikra namespace. Ambiguous, missing, changed, or non-Git mappings are skipped. No model chooses a destination.

### Per-candidate approval

Not selected. The user chose one approval decision for a complete verified report.

### Whole-report approval

Selected. Review produces a complete write plan. Any revision invalidates approval and requires another complete review.

## Decision Outcome

Implement a package-loaded `extensions/dream/` extension and a `dreaming` skill. Keep report review in the current approved model session; do not send reports to a child process through a potentially different provider or process arguments.

### Metadata capture and reminder

At session start, the extension may record only:

- a hash of session identity;
- canonical project namespace and remote repository identity;
- timestamps;
- a random-token process lease proving that the session is still live.

The bounded ledger is stored under the Pi agent state directory using mode-`0700` directories, mode-`0600` files, symlink rejection, a lock, and atomic replacement. Analysis records contain only project, timestamp, snapshot-derived key, and report digest. They contain no session or report content.

A startup reminder may read only the first bounded JSONL header of regular, non-linked session files. It performs no model or Zikra call.

### Explicit `/dream` analysis

`/dream [1-20] [--revisit]`:

1. discovers metadata and resolves each historical repository;
2. excludes the current session and sessions that are recent, unresolved, linked, oversized, malformed, previously analyzed, or unstable;
3. excludes every session with a live cross-process lease, presents the exact repository groups, and asks permission before reading message content;
4. reads a bounded immutable snapshot and follows only the active session branch;
5. retains only user and assistant text, excluding thinking, images, custom messages, compaction/branch summaries, tool calls, and tool results;
6. applies terminal sanitization, credential-pattern redaction, and byte/message/session caps;
7. resolves and freezes the effective provider/model endpoint, displays that destination plus payload size, source-provider metadata, and redaction count, and asks again before model disclosure;
8. after disclosure consent, acquires per-session analysis claims that make concurrent session resume wait, revalidates the exact snapshot and project mapping, and distills each project independently through the frozen provider request with no tools;
9. accepts only strict, bounded, schema-valid JSON with source hashes assigned by trusted code;
10. opens an editable candidate report and prefills the main editor only after user review.

The user explicitly chose to permit any currently selected model provider after the second disclosure gate. Pattern redaction is defense-in-depth and does not guarantee arbitrary prose contains no sensitive data.

### Verification and memory commitment

The Dream extension has no Zikra client or MCP mutation path. The report is untrusted candidate evidence.

The `dreaming` skill performs read-only review in the current session. It searches exact Zikra namespaces, resolves exact indexed repositories, verifies implementation claims against files/tests where available, and classifies candidates as create, duplicate, conflict, or unverified.

The main agent builds a final create-only plan and uses `ask_user` for one complete-report approval with canonical title, prompt, labels, values, and previews. Revision or rejection performs no writes. The Dream extension validates the strict plan embedded in the approval preview and grants a single-use, in-memory authorization for only the exact ordered MCP tool/project/argument tuples. It blocks pre-approval, altered, out-of-order, replayed, extra, denied, and ambiguously failed Zikra mutations. Rejection and completion remain terminal for the current agent run; an error invalidates the plan and requires read-only reconciliation plus fresh approval. Pending candidate and plan digests—but not content—survive reload; the write plan itself must be re-approved after runtime replacement. Zikra mutations also remain independently listed in the MCP adapter's approval gate.

Before each create, the workflow searches again for title and concept collisions. Existing conflicting titles are not overwritten. Writes are sequential, acknowledged, and read back. On partial failure, the workflow stops and reconciles successful and missing operations; it does not claim atomicity or delete successful writes.

## Consequences

### Positive

- Durable knowledge growth is available without automatic transcript retention.
- Project namespaces and provider disclosure are visible and user-controlled.
- Nested model output cannot directly execute tools or write memory.
- Duplicate/conflict review and exact repository evidence improve memory quality.
- Active-session leases, immutable snapshot checks, and endpoint binding make disclosure consent correspond to the data and recipient actually used.
- Metadata reminders make the manual workflow discoverable.

### Negative

- The workflow requires multiple deliberate interactions.
- Legacy sessions rely on the repository's current canonical remote and are labeled accordingly.
- Ambiguous or moved sessions may be skipped.
- Credential-pattern redaction cannot detect every secret or personal datum.
- Multi-project Zikra application can partially fail because no transaction spans projects.
- Read-only review may be incomplete when a repository is not indexed or accessible.

### Neutral

- The ledger records that a snapshot was analyzed, not that every candidate was committed.
- `--revisit` allows deliberate reanalysis.
- Dreaming does not automatically synchronize Zikra with codebase-memory or Git documentation.

## Security and Operational Considerations

- Treat session text, model output, reviewer output, retrieved memories, and repository documents as untrusted data.
- Never use Zikra transcript ingestion or server-side automatic distillation for this workflow.
- Never log or persist model requests/responses, candidate reports, or editor content outside the normal user-controlled Pi session.
- Abort on snapshot identity changes between stat, read, and final stat.
- Keep limits, redaction, approval-envelope binding, branch-state restoration, lease/claim exclusion, and adapter-denial behavior covered by adversarial tests.
- Do not weaken Zikra adapter approvals when using a permissive local permission profile.

## References

- [`extensions/dream/`](../../extensions/dream/)
- [`skills/dreaming/SKILL.md`](../../skills/dreaming/SKILL.md)
- [`extensions/zikra/core.ts`](../../extensions/zikra/core.ts)
- [`SECURITY.md`](../../SECURITY.md)
- [Pi extension documentation](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/extensions.md)
- [Pi session format](https://github.com/earendil-works/pi-mono/blob/main/packages/coding-agent/docs/session-format.md)
