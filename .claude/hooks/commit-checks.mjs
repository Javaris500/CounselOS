#!/usr/bin/env node
/**
 * Backend commit checks — the failures no other tool can see.
 *
 * The toolchain already covers the structural mistakes: importing another
 * module's repository fails ESLint, exporting a repository crashes the
 * bootstrap, a bad type fails typecheck. Those are safe.
 *
 * This file covers the other category — code that compiles, passes lint, reads
 * correctly in review, and is wrong at runtime. Each check below maps to one
 * named failure:
 *
 *   1. soft-delete   a list query missing notDeleted -> returns deleted matters
 *   2. matter-access @MatterAccess on 5 of 6 routes  -> one route wide open
 *   3. role-vs-assignment  user.role === 'ATTORNEY'  -> every attorney in the
 *                                                       firm gets access
 *   4. forbidden paths  an agent committing .env, a migration, or schema.ts
 *
 * Reports every violation at once rather than the first — same philosophy as
 * validateEnvVars(). Finding one problem per commit attempt is its own failure
 * mode.
 *
 * Invoked by pre-commit-guard.sh. Exits 0 clean, 2 blocking.
 */

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Staged content, not the working tree — they can differ, and git commits the index. */
const stagedFiles = () =>
  execFileSync('git', ['diff', '--cached', '--name-only', '--diff-filter=ACM', '-z'], {
    encoding: 'utf8',
  })
    .split('\0')
    .filter(Boolean);

const stagedContent = (path) => {
  try {
    return execFileSync('git', ['show', `:${path}`], { encoding: 'utf8', maxBuffer: 10 << 20 });
  } catch {
    return null; // deleted, or a submodule — nothing to check
  }
};

/**
 * An agent works in a linked worktree; the operator works in the main clone.
 * git reports a different git-dir in a linked worktree, which is the one
 * signal available here that says who is committing.
 */
const isAgentWorktree = () => {
  const q = (arg) => execFileSync('git', ['rev-parse', arg], { encoding: 'utf8' }).trim();
  try {
    return q('--absolute-git-dir') !== execFileSync('git', ['rev-parse', '--path-format=absolute', '--git-common-dir'], { encoding: 'utf8' }).trim();
  } catch {
    return false;
  }
};

/**
 * An explicit, greppable opt-out. Deliberately verbose: it must be cheaper to
 * write the filter than to write the exemption, and it must show up in review.
 */
const EXEMPT = /\/\/\s*commit-check-exempt:\s*\S+/;
const exemptions = (source) => (source.match(new RegExp(EXEMPT, 'g')) ?? []).length;

const violations = [];
const add = (file, rule, detail, fix) => violations.push({ file, rule, detail, fix });

// ---------------------------------------------------------------------------
// 1. Soft delete — every select from a soft-deletable table carries notDeleted
// ---------------------------------------------------------------------------
//
// Counted per table, not per file: `notDeleted` appearing once does not prove
// it appears on all four queries. `.from(x)` is select-shaped by construction —
// inserts use `.insert(x)`, updates `.update(x)`, and joins `.leftJoin(x)`.

const HELPERS = 'apps/api/src/database/helpers.ts';

/**
 * Read from the working tree, falling back to HEAD. NOT from the index —
 * helpers.ts is almost never part of the commit being checked, and reading the
 * index would silently yield an empty table list, disabling this check exactly
 * when it matters. A check that fails open is worse than no check.
 */
let softDeletableCache = null;
const softDeletableTables = () => {
  if (softDeletableCache) return softDeletableCache;

  let source = '';
  try {
    source = readFileSync(HELPERS, 'utf8');
  } catch {
    try {
      source = execFileSync('git', ['show', `HEAD:${HELPERS}`], { encoding: 'utf8' });
    } catch {
      source = '';
    }
  }

  const start = source.indexOf('export const notDeleted');
  const body = start === -1 ? '' : source.slice(start);
  softDeletableCache = [...body.matchAll(/^\s{2}(\w+):\s*isNull\(/gm)].map((m) => m[1]);
  return softDeletableCache;
};

const checkSoftDelete = (file, source) => {
  if (!/\.repository\.ts$/.test(file)) return;

  const exempt = exemptions(source);
  for (const table of softDeletableTables()) {
    const selects = (source.match(new RegExp(`\\.from\\(\\s*${table}\\b`, 'g')) ?? []).length;
    if (selects === 0) continue;

    const filtered = (source.match(new RegExp(`notDeleted\\.${table}\\b`, 'g')) ?? []).length;
    if (filtered + exempt >= selects) continue;

    add(
      file,
      'soft-delete',
      `${selects} select(s) from \`${table}\`, but only ${filtered} use \`notDeleted.${table}\``,
      `Add \`notDeleted.${table}\` to the where clause, usually inside and(...).`,
    );
  }
};

// ---------------------------------------------------------------------------
// 2. Matter access — consistent across every route in a controller
// ---------------------------------------------------------------------------
//
// Not "every route needs it" — /auth/me legitimately carries no decorator and
// is authenticated by the global guard. The real failure is inconsistency: a
// controller that uses @MatterAccess on some routes and silently omits it on a
// late-added GET. If the decorator appears at all, the intent was matter
// scoping, and a route without it is an oversight until stated otherwise.

const ROUTE = /^\s*@(Get|Post|Patch|Put|Delete)\(/;
const ACCESS = /^\s*@(MatterAccess|Public)\(/;

const checkMatterAccess = (file, source) => {
  if (!/\.controller\.ts$/.test(file)) return;
  if (!/@MatterAccess\(/.test(source)) return; // not a matter-scoped controller

  const lines = source.split('\n');
  const classDecl = lines.findIndex((l) => /^export class /.test(l));
  // A class-level @MatterAccess covers every route below it.
  if (lines.slice(0, classDecl === -1 ? 0 : classDecl).some((l) => ACCESS.test(l))) return;

  const unguarded = [];
  for (const [i, line] of lines.entries()) {
    if (!ROUTE.test(line)) continue;

    // Walk back over the contiguous decorator block above this route.
    let covered = false;
    for (let j = i - 1; j >= 0; j--) {
      const above = lines[j];
      if (above.trim() === '' || /^\s*(\*|\/\*|\/\/)/.test(above)) continue;
      if (!/^\s*@/.test(above)) break;
      if (ACCESS.test(above) || EXEMPT.test(above)) {
        covered = true;
        break;
      }
    }
    if (!covered) unguarded.push(`${i + 1}: ${line.trim()}`);
  }

  if (unguarded.length > 0) {
    add(
      file,
      'matter-access',
      `this controller uses @MatterAccess, but ${unguarded.length} route(s) do not carry it:\n      ${unguarded.join('\n      ')}`,
      'Add @MatterAccess, or @Public if the route is genuinely unscoped.',
    );
  }
};

// ---------------------------------------------------------------------------
// 3. Role vs assignment
// ---------------------------------------------------------------------------
//
// `role === 'ATTORNEY'` is not "the attorney on this matter". Under 8G an
// unassigned attorney gets READ_ONLY and an unassigned paralegal gets nothing.
// A role comparison grants both full access and reads as reasonable in review.
//
// RolesGuard is where role comparison legitimately lives; everywhere else it is
// almost always the assignment rule written wrong.

const ROLE_COMPARE = /\.role\s*(===|!==|==|!=)\s*['"`]/;
const ROLE_INCLUDES = /\[[^\]]*['"`](OWNER|ATTORNEY|PARALEGAL)['"`][^\]]*\]\s*\.includes\(\s*\w+\.role/;

const checkRoleVsAssignment = (file, source) => {
  if (!file.startsWith('apps/api/src/')) return;
  if (/\.(spec|e2e-spec)\.ts$/.test(file)) return;
  if (/roles\.guard\.ts$/.test(file)) return; // the one legitimate home

  source.split('\n').forEach((line, i) => {
    if (EXEMPT.test(line)) return;
    if (!ROLE_COMPARE.test(line) && !ROLE_INCLUDES.test(line)) return;

    add(
      file,
      'role-vs-assignment',
      `line ${i + 1}: ${line.trim()}`,
      'If the rule is "the attorney on this matter", gate on assignment (assignedAttorneyId) or @MatterAccess — not on role. If this really is a firm-wide role rule, use @Roles(...) on the route.',
    );
  });
};

// ---------------------------------------------------------------------------
// 4. Paths an agent may never commit
// ---------------------------------------------------------------------------
//
// Ordered migrations are immutable, so two agents generating 0005_* in parallel
// worktrees collide in a way that is painful to unwind. schema.ts is the source
// of truth for 27 tables and six branches editing it is worse. .env is a
// credential leak in a public repo.

const FORBIDDEN = [
  {
    match: (f) => /(^|\/)\.env($|\.[^/]*$)/.test(f) && !/\.env\.example$/.test(f),
    why: 'environment files are gitignored and this repository is public',
  },
  {
    match: (f) => f.startsWith('apps/api/drizzle/'),
    why: 'migrations are ordered and immutable — the operator generates them',
  },
  {
    match: (f) => f === 'apps/api/src/database/schema.ts',
    why: 'the schema lands in one operator pass, never per-module',
  },
];

const checkForbiddenPaths = (files, agent) => {
  if (!agent) return; // operator owns all four
  for (const file of files) {
    const hit = FORBIDDEN.find((rule) => rule.match(file));
    if (!hit) continue;
    add(file, 'forbidden-path', hit.why, 'Unstage it and file a blocker in .team-5/log/error-log.md.');
  }
};

// ---------------------------------------------------------------------------

const files = stagedFiles();
if (files.length === 0) process.exit(0);

const agent = isAgentWorktree();
checkForbiddenPaths(files, agent);

for (const file of files) {
  if (!/\.ts$/.test(file)) continue;
  const source = stagedContent(file);
  if (source === null) continue;

  checkSoftDelete(file, source);
  checkMatterAccess(file, source);
  checkRoleVsAssignment(file, source);
}

if (violations.length === 0) process.exit(0);

const byRule = violations.reduce((acc, v) => ((acc[v.rule] ??= []).push(v), acc), {});
const lines = [`BLOCKED: ${violations.length} issue(s) in staged changes.`, ''];

for (const [rule, group] of Object.entries(byRule)) {
  lines.push(`  [${rule}]`);
  for (const v of group) {
    lines.push(`    ${v.file}`);
    lines.push(`      ${v.detail}`);
    lines.push(`      fix: ${v.fix}`);
  }
  lines.push('');
}

const codeRules = Object.keys(byRule).filter((r) => r !== 'forbidden-path');
if (codeRules.length > 0) {
  lines.push('These compile and pass lint. No other tool in the toolchain catches them.');
  lines.push('');
  lines.push('If a line is genuinely correct as written, annotate it:');
  lines.push('  // commit-check-exempt: <one-line reason>');
  lines.push('An exemption is a review item, not a silencer — it must say why.');
  lines.push('');
}
lines.push('See docs/19-commit-and-merge.md.');

console.error(lines.join('\n'));
process.exit(2);
