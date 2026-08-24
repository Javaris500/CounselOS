#!/usr/bin/env bash
#
# check-state.sh — what is actually in this repo, right now.
#
# WHY THIS EXISTS
#
# Two status documents have been materially wrong about this project, both in
# the same way: they ran `grep -c "pgTable" apps/api/src/db/schema.ts` against a
# path that does not exist. A missing file makes grep print nothing and exit
# non-zero into a pipeline nobody checked, and "nothing" reads exactly like
# "zero tables". Both documents concluded the schema was empty. It has had 27
# tables since 2026-08-18.
#
# The failure was never the wrong path. It was that the verification step
# returned an answer SHAPED LIKE AGREEMENT. A command that dies loudly when its
# target is missing would have been caught in seconds.
#
# So the rule this script enforces on itself: every path is asserted before it
# is measured, and a missing path is a hard failure with a non-zero exit — never
# a zero, never a blank, never a silent skip.
#
# Paste the output into a status doc instead of writing counts from memory.
# See SURPRISES.md 002 and 004.

set -uo pipefail

# Same reasoning as check-mounts.sh: report on the tree you are standing in.
REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not inside a git repository"; exit 2; }
cd "$REPO"

FAIL=0
red()  { printf '\033[31m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

# A missing target is the bug this script exists to catch. Say so, loudly.
need() {
  if [ ! -e "$1" ]; then
    red "  MISSING  $1"
    red "           A count against this path would print nothing and read as zero."
    FAIL=1
    return 1
  fi
  return 0
}

count_in() { # count_in <label> <path> <pattern>
  if need "$2"; then printf '  %-22s %s\n' "$1" "$(grep -c "$3" "$2")"; fi
}

echo
echo "CounselOS — actual state"
dim "  $(date -u '+%Y-%m-%d %H:%M UTC')  ·  HEAD $(git rev-parse --short HEAD)"
echo

echo "Schema and migrations"
count_in "tables (pgTable)" "apps/api/src/database/schema.ts" "pgTable"
if need "apps/api/drizzle"; then
  printf '  %-22s %s\n' "migrations" "$(find apps/api/drizzle -maxdepth 1 -name '*.sql' | wc -l | tr -d ' ')"
fi
echo

echo "Backend"
if need "apps/api/src/modules"; then
  printf '  %-22s %s\n' "modules" "$(ls apps/api/src/modules | tr '\n' ' ')"
fi
printf '  %-22s %s\n' "API e2e specs" "$(find apps/api/src -name '*.e2e-spec.ts' | wc -l | tr -d ' ')"
echo

echo "Frontend"
if need "apps/web/src/app"; then
  printf '  %-22s %s\n' "routes" "$(find apps/web/src/app -name 'page.tsx' | wc -l | tr -d ' ')"
fi
if need "apps/web/src/components/ui"; then
  printf '  %-22s %s\n' "ui primitives" "$(find apps/web/src/components/ui -name '*.tsx' | wc -l | tr -d ' ')"
fi
if need "apps/web/e2e"; then
  printf '  %-22s %s\n' "browser specs" "$(find apps/web/e2e -name '*.spec.ts' | wc -l | tr -d ' ')"
fi
echo

echo "Agent system"
if need "agents"; then
  printf '  %-22s %s\n' "agents" "$(ls agents | tr '\n' ' ')"
fi
for d in dispatch reports findings compliance; do
  if need ".team-5/$d"; then
    n=$(find ".team-5/$d" -name '*.md' ! -name '_TEMPLATE*' | wc -l | tr -d ' ')
    printf '  %-22s %s\n' "$d written" "$n"
  fi
done
if need "COST-LOG.md"; then
  printf '  %-22s %s\n' "cost rows" "$(grep -cE '^\| [0-9]+ \|' COST-LOG.md || true)"
fi
echo

echo "Repo"
printf '  %-22s %s\n' "commits" "$(git rev-list --count HEAD)"
printf '  %-22s %s\n' "branch" "$(git rev-parse --abbrev-ref HEAD)"
printf '  %-22s %s\n' "worktrees" "$(git worktree list | wc -l | tr -d ' ')"
echo

if [ "$FAIL" -ne 0 ]; then
  red "FAILED — a path above is missing."
  red "Do not quote these numbers. A count against a missing path is not zero, it is nothing."
  exit 1
fi

dim "  All paths present. Numbers above are real and safe to quote."
echo
