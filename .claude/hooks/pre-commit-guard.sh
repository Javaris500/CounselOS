#!/usr/bin/env bash
# .claude/hooks/pre-commit-guard.sh
#
# Runs before Claude executes a `git commit` Bash command (see
# .claude/settings.json — the `if` filter keeps it from spawning on every
# unrelated shell command).
#
# Enforces one rule that's explicit in docs/07-design-handoff.md and CLAUDE.md:
# data-testid is added in the SAME COMMIT as the component, never retrofitted.
# Playwright tests depend on it; text/CSS selectors break on every design
# change. This hook is what makes that a guarantee instead of a habit someone
# eventually forgets.
#
# This is a Claude Code PreToolUse hook, NOT a git hook. Two consequences:
#   - the tool call arrives as JSON on stdin, not as $1
#   - blocking means exit 2 with the reason on stderr; exit 1 is a non-blocking
#     error that Claude never sees
# `git commit --no-verify` does not bypass it, because this hook fires before
# git runs at all.

set -uo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
PAYLOAD="$(cat)"

CMD="$(printf '%s' "$PAYLOAD" | node -e '
  let raw = "";
  process.stdin.on("data", (c) => (raw += c));
  process.stdin.on("end", () => {
    try {
      process.stdout.write(JSON.parse(raw)?.tool_input?.command ?? "");
    } catch {
      process.stdout.write("");
    }
  });
' 2>/dev/null)"

# Only act on git commit — pass everything else through.
[[ "$CMD" == *"git commit"* ]] || exit 0

cd "$REPO_ROOT" || exit 0

# Only check staged frontend component files.
#
# One pathspec, not two: git's `**/` requires a literal `/`, so
# 'apps/web/src/app/**/*.tsx' silently skips direct children — page.tsx and
# layout.tsx, the two files most likely to hold the first interactive element.
STAGED_COMPONENTS="$(git diff --cached --name-only --diff-filter=ACM -z -- 'apps/web/src/**/*.tsx' 2>/dev/null | tr '\0' '\n')"

[[ -n "$STAGED_COMPONENTS" ]] || exit 0

MISSING=""

while IFS= read -r FILE; do
  [[ -n "$FILE" && -f "$FILE" ]] || continue

  # Does this file define an interactive element? (button, input, form,
  # onClick handler — a rough but useful heuristic, not exhaustive)
  if ! grep -qE '<(button|input|select|textarea)|onClick=|onSubmit=' "$FILE" 2>/dev/null; then
    continue
  fi

  # Does it have at least one data-testid?
  if ! grep -q 'data-testid=' "$FILE" 2>/dev/null; then
    MISSING="${MISSING}
  - ${FILE}"
  fi
done <<< "$STAGED_COMPONENTS"

if [[ -n "$MISSING" ]]; then
  {
    echo "BLOCKED: interactive component(s) staged with no data-testid:"
    echo "$MISSING"
    echo ""
    echo 'Convention: data-testid="{domain}-{element}-{action?}", kebab-case.'
    echo "See docs/07-design-handoff.md and docs/11-test-data.md Part 6."
    echo ""
    echo "Add the attribute in this same commit — never retrofitted, because"
    echo "text and CSS selectors break on every redesign. If this is genuinely"
    echo "a non-interactive file the heuristic misread, say so and the user can"
    echo "approve the commit directly."
  } >&2
  exit 2
fi

exit 0
