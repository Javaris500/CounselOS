#!/usr/bin/env bash
# .claude/hooks/post-edit-check.sh
#
# Runs after Claude edits or writes a file (see .claude/settings.json).
#
# Lints the single file that just changed, using the project's own ESLint
# config. That config is not style — packages/config/eslint/nest.js encodes the
# architecture rules from 18-nestjs-conventions.md as lint errors: the
# service-not-repository boundary, no Scope.REQUEST, no app.useGlobal*(),
# no bare process.env, no argument-less new Date().
#
# Those rules already fail at `pnpm lint`. The point of running them here is
# TIMING: a boundary violation surfaces on the edit that introduced it, while
# the reasoning is still in context, instead of at the end of a module when
# unwinding it is expensive.
#
# Non-blocking by design. It reports; it does not veto an edit. A hook that
# rejects writes turns every in-progress refactor into a fight.
#
# jq is deliberately not used — it isn't installed on every dev machine here,
# and Node is a hard prerequisite anyway (.nvmrc pins 24).

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PAYLOAD="$(cat)"

# --- Extract the edited path. Write and Edit both use tool_input.file_path;
#     tool_response.filePath is preferred when present because it is the path
#     actually written after any normalisation.
FILE="$(printf '%s' "$PAYLOAD" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      const d = JSON.parse(raw);
      process.stdout.write(d?.tool_response?.filePath ?? d?.tool_input?.file_path ?? "");
    } catch {
      process.stdout.write("");
    }
  });
' 2>/dev/null)"

[[ -n "$FILE" && -f "$FILE" ]] || exit 0

# Only TypeScript. Everything else (md, json, sql, sh) has no ESLint config here.
[[ "$FILE" == *.ts || "$FILE" == *.tsx ]] || exit 0

# Test files switch most of these rules off on purpose (base.js, nest.js).
# Linting them here would produce noise the config already decided to ignore.
case "$FILE" in
  *.spec.ts | *.e2e-spec.ts | */__tests__/* | */test/*) exit 0 ;;
esac

# --- Find the owning workspace package: the nearest ancestor with a flat
#     config. ESLint resolves eslint.config.mjs from cwd, so the file must be
#     linted from its own package root or the rules don't apply.
PKG_DIR="$(cd "$(dirname "$FILE")" && pwd)"
while [[ "$PKG_DIR" != "/" && "$PKG_DIR" != "$REPO_ROOT" ]]; do
  [[ -f "$PKG_DIR/eslint.config.mjs" ]] && break
  PKG_DIR="$(dirname "$PKG_DIR")"
done
[[ -f "$PKG_DIR/eslint.config.mjs" ]] || exit 0

REL="${FILE#"$PKG_DIR"/}"

# --- Lint. JSON output, not a text formatter: ESLint 10 dropped the `unix` and
#     `compact` formatters from core, and stylish output carries ANSI escapes
#     that would have to be stripped before embedding in JSON.
#     A non-zero exit means findings; it does not mean the hook failed.
OUTPUT="$(cd "$PKG_DIR" && npx --no-install eslint --format json "$REL" 2>/dev/null)"

# Empty stdout means ESLint never ran — no install yet, or a config error.
# Stay silent rather than reporting a toolchain problem as a code problem.
[[ -n "$OUTPUT" ]] || exit 0

# --- Report back. additionalContext goes to Claude so it can fix the violation
#     immediately; systemMessage is the one line the user sees. Exits 0 with no
#     output when the file is clean.
printf '%s' "$OUTPUT" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    const file = process.argv[1];
    let results;
    try {
      results = JSON.parse(raw);
    } catch {
      process.exit(0);
    }

    const messages = (results ?? []).flatMap((r) => r.messages ?? []);
    if (messages.length === 0) process.exit(0);

    const lines = messages.map(
      (m) =>
        `  ${file}:${m.line ?? 0}:${m.column ?? 0}  ` +
        `${m.severity === 2 ? "error" : "warning"}  ` +
        `${m.message}${m.ruleId ? `  (${m.ruleId})` : ""}`,
    );
    const errors = messages.filter((m) => m.severity === 2).length;
    const label = `${messages.length} issue(s)${errors ? `, ${errors} error(s)` : ""}`;

    process.stdout.write(
      JSON.stringify({
        systemMessage: `ESLint: ${label} in ${file}`,
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext:
            `ESLint reported ${label} in the file you just edited (${file}).\n` +
            `These rules encode architecture decisions from 18-nestjs-conventions.md, ` +
            `not style — fix them now rather than at \`pnpm lint\`.\n\n` +
            lines.join("\n"),
        },
      }),
    );
  });
' "$REL"

exit 0
