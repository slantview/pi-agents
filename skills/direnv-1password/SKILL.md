---
name: direnv-1password
description: Designs, reviews, and troubleshoots local developer environments using direnv, .envrc, and 1Password CLI without committing plaintext secrets. Use when adding project environment variables, migrating .env files, creating op:// references, or debugging direnv and 1Password integration.
compatibility: Requires direnv 2.x and 1Password CLI 2.x; desktop-app CLI integration is recommended on macOS and supported Linux desktops.
---

# direnv + 1Password

Use direnv for directory-scoped non-secret configuration and 1Password for secrets. This machine already has the zsh direnv hook, `direnv` 2.x, and `op` 2.x.

## Local conventions

- Select the intended 1Password account through `OP_ACCOUNT`; never hardcode a personal account identifier in shared files.
- Shared integration fields commonly live under `op://Shared/LocalEnvironment/<section>/<field>`.
- Keep project-specific secrets in the narrowest appropriate vault/item instead of adding everything to `LocalEnvironment`.
- Secret-reference files may be committed only when revealing vault/item/field names is acceptable to the repository audience.
- Never commit resolved secret values.

## Choose the least-exposed pattern

### Preferred: command-scoped secrets with `op run`

Use this when one command or service needs secrets. Commit a reference-only file such as `.env.op`:

```dotenv
DATABASE_URL="op://Shared/My Project/dev/DATABASE_URL"
API_TOKEN="op://Shared/My Project/dev/API_TOKEN"
```

Keep `.envrc` limited to non-secrets:

```bash
export APP_ENV=development
PATH_add bin
```

Run the application with secrets only in its subprocess:

```bash
op run --account "$OP_ACCOUNT" --env-file=.env.op -- ./bin/dev
```

Prefer this pattern because secrets do not remain in the interactive shell after the process exits. Keep 1Password masking enabled; do not use `--no-masking` in routine commands.

### When interactive tooling truly requires exported secrets

Use one bulk `op inject` call instead of many `op read` calls. Create a reference-only `.env.tpl`:

```dotenv
DATABASE_URL="op://Shared/My Project/dev/DATABASE_URL"
API_TOKEN="op://Shared/My Project/dev/API_TOKEN"
```

Then use a reviewed `.envrc`:

```bash
strict_env

if ! has op; then
  log_error "1Password CLI (op) is required"
  return 1
fi

: "${OP_ACCOUNT:?set OP_ACCOUNT to your 1Password account identifier}"
export OP_ACCOUNT
watch_file .env.tpl

_resolved="$(op inject --account "$OP_ACCOUNT" --in-file .env.tpl 2>/dev/null)" || {
  log_error "Unable to resolve .env.tpl from 1Password; unlock 1Password and run: direnv reload"
  return 1
}

eval "$(printf '%s\n' "$_resolved" | direnv dotenv bash /dev/stdin)"
unset _resolved

env_vars_required DATABASE_URL API_TOKEN
```

`direnv dotenv bash` performs shell-safe quoting. The resolved values still enter the interactive shell and are available to child processes, so use this only when command-scoped `op run` is impractical.

## Setup and review workflow

1. Inspect existing `.envrc`, `.env*`, `.gitignore`, scripts, Compose files, and CI configuration.
2. Inventory variable **names only**. Never print or paste values into chat, logs, diffs, tests, or Zikra.
3. Identify the correct 1Password account, vault, item, section, and field. Reuse established fields where appropriate.
4. Prefer a reference-only `.env.op` plus `op run`; use `.env.tpl` + bulk `op inject` only for persistent shell variables.
5. Keep non-secret defaults in `.envrc`; keep secrets in 1Password.
6. Add generated plaintext files to `.gitignore`. Avoid generating them at all when the consumer accepts environment variables.
7. Review every `.envrc` as executable code before running `direnv allow`.
8. Validate without exposing values:

```bash
direnv status
op account list
op read --account "$OP_ACCOUNT" 'op://Vault/Item/field' >/dev/null
direnv reload
# Check presence, never value:
direnv exec . sh -c 'test -n "$API_TOKEN"'
```

9. For command-scoped mode, verify with a presence check inside `op run`:

```bash
op run --account "$OP_ACCOUNT" --env-file=.env.op -- sh -c 'test -n "$API_TOKEN"'
```

## Hard rules

- Never use `set -x` while secrets are loaded.
- Never echo, print, serialize, or snapshot resolved values.
- Never use `dotenv .env` on a plaintext secret file intended for source control.
- Never put plaintext secrets directly in `.envrc`.
- Never write resolved `op inject` output to a tracked file.
- Treat `.envrc` as code execution; run `direnv allow` only after reviewing changes.
- Remember that same-user processes may be able to inspect environment variables. Use command-scoped secrets and least-privilege 1Password access where practical.
- If a secret appears in Git history, logs, or agent output, rotate it; deletion alone is insufficient.

## Troubleshooting

- **`op` account not found:** open 1Password, enable Settings → Developer → Integrate with 1Password CLI, and ensure the intended account is signed in.
- **Biometric prompt or locked app:** unlock 1Password, test one `op read ... >/dev/null`, then run `direnv reload`.
- **Changed `.envrc` blocked:** review the diff, then run `direnv allow`.
- **Slow reloads:** replace repeated `op read` calls with one `op inject`, or switch to command-scoped `op run`.
- **Literal `op://...` reaches the app:** the command was not wrapped in `op run`, or the template was loaded with `dotenv` without resolution.
- **Variable expands too early:** when testing inside `op run`, use a subshell: `op run -- sh -c 'test -n "$API_TOKEN"'`.

## References

- 1Password: https://developer.1password.com/docs/cli/secrets-environment-variables
- 1Password secret references: https://developer.1password.com/docs/cli/secret-references
- direnv stdlib: https://direnv.net/man/direnv-stdlib.1.html
