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
