# Role Template

Format for `.claude/agents/<name>.md`. The `governance` skill parses
this exact shape.

```markdown
---
name: <kebab-case-name>
description: <one-sentence trigger for Claude Code's auto-invocation>
purpose: <future-state sentence — "X is always Y", not a task>
serves_purpose: <one line: how this role serves the Anchor Circle Purpose>
accountabilities:
  - <continuous activity>
domains:
  - <glob pattern this role exclusively owns>
invocation_stats:
  invocations_30d: 0
  success_rate: null
  last_used: null
  created_at: <YYYY-MM-DD UTC>
---

You are the **<n>** role. Your purpose is to ensure <restate purpose>.

## How to do the work
<3 to 6 numbered steps>

## What you do not do
<2 to 4 explicit non-responsibilities>
```

## Field rules

- `description` — auto-invocation trigger; what Claude Code matches on.
- `purpose` — future state, not a procedure. Bad: "Reviews PRs". Good:
  "Changes merged to main are safe and maintainable".
- `serves_purpose` — required by clause 11. Reuse vocabulary from
  `.claude/ANCHOR.md` Purpose verbatim where natural; that gives
  governance a mechanical traceability hook. Validator only checks
  presence.
- `accountabilities` — present participle, ≥ 1.
- `domains` — exclusive ownership. ≥ 0 (a Reviewing-only role has none).
  No two roles may overlap (clause 3) except a declared Producer/
  Reviewer pair.
- `invocation_stats` — written by governance only. Do not edit by hand.
  `created_at` drives clause 5 (no deletion within 7 days).
