---
name: adr-documentation
description: Creates, updates, reviews, indexes, and supersedes local Architecture Decision Records and related architecture documentation. Use for ADR work, documenting design decisions, checking implementation against accepted decisions, maintaining docs/adr files, or reconciling architecture docs with code.
---

# ADR and Documentation Management

Manage ADRs in the current repository using its existing local conventions. Treat the repository—not a generic template—as the source of truth for paths, numbering, structure, terminology, and lifecycle states.

## Discover local conventions first

Before creating or modifying an ADR:

1. Find repository guidance such as `AGENTS.md`, `CONTRIBUTING.md`, documentation READMEs, and ADR templates.
2. Locate ADR directories and indexes. Common paths include `docs/adr/`, `doc/adr/`, `docs/decisions/`, and `architecture/decisions/`, but do not assume one.
3. Read the local ADR README/template and at least two recent ADRs, including the newest accepted ADR when possible.
4. Determine:
   - filename and sequence-number format
   - required sections and heading style
   - accepted status vocabulary
   - date format
   - cross-reference style
   - whether an index or generated table must be updated
5. Search for related ADRs and architecture documents before proposing a new record. Update an existing draft when it already covers the same decision.

Use codebase-memory-mcp for broad architectural discovery when available, then confirm exact wording and implementation with Pi's `read` and search tools.

## Decide the correct operation

- **Create:** a durable architectural choice has been made and no existing ADR records it.
- **Update:** fix clarity, references, consequences, or implementation status without rewriting historical facts.
- **Amend:** add a dated clarification when the original decision remains valid but needs material qualification.
- **Supersede:** a newer decision replaces all or part of an accepted ADR. Create the new ADR and link both directions; do not silently rewrite history.
- **Deprecate:** the decision no longer applies and no replacement decision is required.
- **Review only:** report drift or gaps without editing when the user asks for evaluation rather than changes.

Do not mark a proposal as accepted unless the user explicitly says the decision is accepted or repository governance clearly establishes acceptance.

## Creating an ADR

1. Select the next number by inspecting existing filenames. Re-check immediately before writing to avoid collisions.
2. Copy the repository's template and section order. If no convention exists, use:
   - Title
   - Status
   - Date
   - Context and Problem Statement
   - Decision Drivers
   - Considered Options
   - Decision Outcome
   - Consequences
   - Security and Operational Considerations, when relevant
   - References
3. Write the decision as a specific, testable statement—not a project summary or implementation diary.
4. Explain meaningful alternatives and why they were rejected. Do not fabricate options that were never considered.
5. Record positive, negative, and neutral consequences honestly.
6. Link related ADRs, source files, tests, plans, issues, specifications, and operational documentation using repository-relative links where appropriate.
7. Update the ADR index or README if local convention requires it.
8. Search for architecture documents that now conflict with the decision and update them in the same change when safe.

## Updating existing ADRs

Preserve historical integrity:

- Do not change the original decision merely because implementation later drifted.
- Correct typos and broken links directly.
- Use a dated amendment or a superseding ADR for material decision changes.
- When changing status, preserve the old state in history or metadata if local conventions support it.
- For supersession, add `Superseded by` to the old ADR and `Supersedes` to the new ADR.
- Keep links relative and verify that referenced local files exist.

## Implementation-alignment review

When asked whether code meets an ADR:

1. Read the ADR completely, including referenced ADRs and architecture documents.
2. Convert its decision and required controls into a checklist of observable claims.
3. Trace each claim into actual entry points, configuration, workflows, tests, deployment manifests, and failure paths.
4. Distinguish clearly between:
   - implemented and tested
   - implemented but untested
   - partially implemented
   - documented only or feature-flagged off
   - contradicted by code
   - unverifiable from the repository
5. Cite exact paths and line ranges for every material conclusion.
6. Do not treat comments, plans, proposed documents, or disabled code as proof of runtime enforcement.
7. Recommend whether to fix code, amend documentation, or supersede the ADR.

## Documentation quality checks

After edits:

- verify numbering and filename uniqueness
- verify frontmatter or status/date fields
- verify local Markdown links and referenced paths
- check index ordering and entries
- search for stale references to superseded decisions
- run repository documentation lint, formatting, or link-check commands when available
- inspect `git diff` to ensure only intended documentation changed

Never run broad auto-formatters that rewrite unrelated documentation without explicit approval.

## Writing style

- Be concise, factual, and durable.
- Explain why the decision exists and what constraints it creates.
- Use present tense for the accepted decision and past tense for historical context.
- Avoid secrets, transient credentials, personal data, and environment-specific values.
- Avoid claims such as “secure,” “sandboxed,” or “isolated” without naming the concrete enforcement mechanism and failure behavior.
- Use Mermaid only when it materially clarifies boundaries or execution flow and local docs support it.

## Completion report

Summarize:

- ADRs and related documents created or changed
- status and decision recorded
- superseded or related ADRs
- implementation evidence reviewed
- documentation checks run
- unresolved governance or implementation gaps
