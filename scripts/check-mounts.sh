#!/usr/bin/env bash
#
# check-mounts.sh — did this agent write outside its declared boundary?
#
# WHY THIS EXISTS
#
# `agents/*/identity.md` and `.team-5/README.md` both state that an agent's file
# boundary is enforced. Until now nothing enforced it. The paths were prose an
# agent could read and choose to honor, which SANDBOX.md says plainly and the
# agent-facing docs do not.
#
# This is SANDBOX.md's "diff enforcement at phase close", and it is the half of
# Tier 0 that needs no container: take the branch's changed files, compare them
# against the dispatch's declared `may_edit` and `may_append_only`, and fail on
# anything else. It produces `verification.ownership` as a byproduct.
#
# It does NOT replace per-agent mounts. A mount stops the write; this catches it
# afterward. Run it before merging any agent branch — the merge queue's
# integrate step is the right place.
#
#   ./scripts/check-mounts.sh .team-5/dispatch/<agent>-<slice>-dispatch.md [base]
#
# The dispatch file IS the mount declaration. One source of truth, and the thing
# the agent was handed is the thing it is measured against.

set -uo pipefail

# The tree being checked is the CURRENT one, not the script's own. Resolving to
# `dirname $0/..` meant an absolute-path invocation from a worktree silently
# checked the main repo instead, found no changes, and printed "Nothing to
# check" — which reads exactly like a pass. A verification tool that reports
# success when pointed at the wrong target is worse than no tool.
REPO="$(git rev-parse --show-toplevel 2>/dev/null)" || { echo "not inside a git repository"; exit 2; }
cd "$REPO"

DISPATCH="${1:-}"
BASE="${2:-main}"

red()  { printf '\033[31m%s\033[0m\n' "$*"; }
grn()  { printf '\033[32m%s\033[0m\n' "$*"; }
dim()  { printf '\033[2m%s\033[0m\n' "$*"; }

[ -n "$DISPATCH" ] || { red "usage: check-mounts.sh <dispatch-file> [base-ref]"; exit 2; }
[ -f "$DISPATCH" ] || { red "MISSING  $DISPATCH — no dispatch means no declared boundary."; exit 2; }

# Pull the two path lists out of the YAML frontmatter. `-` bullets under each
# key, stopping at the next key at the same indent.
extract() {
  awk -v key="$1" '
    $0 ~ "^  " key ":" { on=1; next }
    on && /^  [a-z_]+:/ { on=0 }
    on && /^ *#/ { next }                      # a comment line is not a path
    on && /^ *- / {
      sub(/^ *- /, "")
      sub(/[ \t]+#.*$/, "")                    # strip a trailing inline comment
      gsub(/^[ \t]+|[ \t]+$/, "")
      gsub(/^["\047]|["\047]$/, "")           # strip surrounding quotes — a quoted
                                               # glob is still a glob, not a literal
      if ($0 != "") print
    }
  ' "$DISPATCH"
}

mapfile -t MAY_EDIT   < <(extract "may_edit")
mapfile -t MAY_APPEND < <(extract "may_append_only")

[ "${#MAY_EDIT[@]}" -gt 0 ] || { red "No may_edit paths in $DISPATCH. A dispatch without a boundary is not a dispatch."; exit 2; }

echo
echo "Ownership check"
dim "  dispatch  $DISPATCH"
dim "  range     $BASE...HEAD"
echo
dim "  may_edit:"        ; for p in "${MAY_EDIT[@]}";   do dim "    $p"; done
if [ "${#MAY_APPEND[@]}" -gt 0 ]; then
  dim "  may_append_only:"; for p in "${MAY_APPEND[@]}"; do dim "    $p"; done
fi
echo

mapfile -t CHANGED < <(git diff --name-only "$BASE"...HEAD 2>/dev/null)
if [ "${#CHANGED[@]}" -eq 0 ]; then
  dim "  No changes against $BASE. Nothing to check."; echo; exit 0
fi

# A boundary is a directory prefix OR a glob. Both are needed: a feature agent
# owns `modules/transactions/` (a directory), a verification agent owns
# `*.test.tsx` (a suffix, anywhere). SANDBOX.md flagged that mounts cannot
# express the second — this is the diff-enforcement half doing it instead.
# Bash `case` globs match `/`, so `*.test.tsx` spans directories as intended.
under() {
  case "$2" in
    *[*?]*) case "$1" in $2) return 0 ;; *) return 1 ;; esac ;;
    *)      case "$1" in "$2"*) return 0 ;; *) return 1 ;; esac ;;
  esac
}

VIOLATIONS=0; APPEND_BAD=0; OK=0

for f in "${CHANGED[@]}"; do
  allowed=0
  for p in "${MAY_EDIT[@]}"; do under "$f" "$p" && { allowed=1; break; }; done

  if [ "$allowed" -eq 1 ]; then OK=$((OK+1)); continue; fi

  appendable=0
  for p in "${MAY_APPEND[@]}"; do under "$f" "$p" && { appendable=1; break; }; done

  if [ "$appendable" -eq 1 ]; then
    # "Append-only" is a real constraint, so verify it rather than trusting it:
    # a modified or removed line means an existing entry was changed.
    removed=$(git diff --numstat "$BASE"...HEAD -- "$f" | awk '{print $2}')
    if [ "${removed:-0}" -gt 0 ]; then
      red "  MODIFIED SHARED FILE  $f  ($removed line(s) removed)"
      red "                        Declared append-only. Existing entries may not change."
      APPEND_BAD=$((APPEND_BAD+1))
    else
      grn "  appended              $f"
      OK=$((OK+1))
    fi
    continue
  fi

  red "  OUTSIDE BOUNDARY      $f"
  VIOLATIONS=$((VIOLATIONS+1))
done

echo
if [ "$VIOLATIONS" -eq 0 ] && [ "$APPEND_BAD" -eq 0 ]; then
  grn "  ownership: PASS  ($OK file(s), all within boundary)"
  echo; exit 0
fi

red "  ownership: FAIL  ($VIOLATIONS outside boundary, $APPEND_BAD shared-file modification(s))"
red "  This work does not ship. Either the agent exceeded its mount, or the dispatch"
red "  declared the wrong boundary — both are findings, and the difference matters."
echo
exit 1
