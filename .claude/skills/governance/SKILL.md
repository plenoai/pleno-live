---
name: governance
description: Auto-evolve the role set based on invocation statistics. Triggered by `/governance auto-run` from the SessionEnd hook, by `/governance dry-run` for inspection, or by `/governance` for interactive review.
allowed-tools: Read, Write, Edit, Bash(git:*), Bash(jq:*), Bash(.claude/hooks/*:*), Bash(tests/*:*), Glob, Grep
---

# governance

Layer 2. The only entity permitted to mutate `.claude/agents/` after
initial generation. Maintains the governance record (Git commits +
`governance-log.jsonl`) and runs the evolution loop, driven by
statistics rather than meetings.

Bounded by `.claude/CONSTITUTION.md` UNIVERSAL. Reads
`.claude/ANCHOR.md` to align new role proposals; cannot modify it
(clause 12).

## Modes

| Trigger | Mode | Behavior |
|---|---|---|
| `/governance auto-run` | auto | Apply ≤ 3 changes without confirmation. Hook-invoked. Commit on branch. Push only if `GOVERNANCE_AUTO_PUSH=1`. |
| `/governance dry-run` | dry | Print proposals only. No file changes. |
| `/governance` | interactive | Show proposals. Ask before each. Ask before pushing. |

Default mode (no args): interactive.

The SessionEnd `threshold-check.sh` hook spawns auto-run only when
`GOVERNANCE_AUTO_RUN=1` is set. Until the user opts in, threshold
trips are logged but not acted upon.

## Step 0 — Read constraints

Read `.claude/CONSTITUTION.md` (non-negotiable) and `.claude/ANCHOR.md`
(informs Step 5 drafting). Abort on parse errors or empty Purpose.

## Step 1 — Aggregate signals

```bash
tail -n 10000 .claude/state/stats.jsonl | jq -s '.'
tail -n 10000 .claude/state/prompts.jsonl | jq -s '.'
ls .claude/agents/*.md
tail -n 50 .claude/state/governance-log.jsonl
```

Aggregate per-role for the last 30 days:
`invocations_30d`, `success_rate` (null if `< 5` invocations),
`last_used`, and `co_invocation` (role pairs in same session).

## Step 2 — Detect tensions

See `references/tension-detection.md` for the full table. Six types:
over-use, under-use, failure, overlap, uncovered, override.

## Step 3 — Order proposals

See `references/proposal-priority.md`.

```
1. failure-rate fixes
2. deletions
3. splits
4. additions
5. merges
```

In auto-run, take at most 3 in this order (clause 7).

## Step 4 — Validate each proposal

```bash
.claude/hooks/constitution-validator.sh <role-file>   # 1, 2, 9, 10
.claude/hooks/domain-checker.sh                       # 3
tests/governance-tests.sh                             # 4, 5, 7, 8
```

If any check fails, drop the proposal and log the rejection with the
specific clause cited.

## Step 5 — Apply

- **Add** → write `.claude/agents/<n>.md` with `created_at` set to today
- **Update** → edit in place, preserve `created_at`
- **Delete** → `mv .claude/agents/<n>.md .claude/agents/.archive/<UTC-date>/`
- **Split** → write new files, then archive original
- **Merge** → write new file, then archive both originals

When **adding** or **splitting**, draft `purpose` and `serves_purpose`
reusing Anchor Circle Purpose vocabulary verbatim where natural —
gives the human a mechanical trace, without LLM-judged alignment.

## Step 6 — Commit

```bash
git checkout -b governance/$(date -u +%F)
git add .claude/agents/
git commit -m "governance: <verb> <role> [+N more]"
```

**Push is opt-in.** Governance is reversible at the commit level (the
user can drop the branch), so creating a branch is safe. Pushing exposes
the change to a shared remote and is therefore gated behind an explicit
signal.

- **auto-run**: push only when `GOVERNANCE_AUTO_PUSH=1` is set in the
  environment. Otherwise leave the branch local; the user runs
  `git push origin HEAD` when they choose to review remotely.
- **interactive / dry-run**: ask before pushing. Never push silently.

```bash
if [ "${GOVERNANCE_AUTO_PUSH:-0}" = "1" ]; then
  git push origin HEAD
fi
```

## Step 7 — Log

Append to `.claude/state/governance-log.jsonl`:

```json
{"ts":"...","verb":"add|update|delete|split|merge",
 "role":"...","tension":"...","status":"applied|rejected",
 "reason":"...","branch":"..."}
```

## What you must not do

- Edit `.claude/CONSTITUTION.md` (clause 9)
- Edit `.claude/ANCHOR.md` (clauses 9, 12)
- Edit `.claude/settings.json` (clause 9)
- Edit anything under `.claude/hooks/` (clause 9)
- Edit anything under `.claude/skills/governance/` (clauses 1, 9)
- Delete a role created less than 7 days ago (clause 5)
- Exceed 3 changes in one run (clause 7)
- Let total roles fall below 2 or rise above 20 (clause 8)
- Generate role files without `serves_purpose` (clause 11)

## Meta-stability

If `governance-log.jsonl` shows the same role being repeatedly modified
(more than 3 governance touches in 14 days), freeze that role and log a
`meta-stability-freeze` entry. The user's intervention is needed.
