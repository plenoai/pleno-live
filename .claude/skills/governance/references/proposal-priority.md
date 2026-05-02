# Proposal Priority

When a governance run produces more proposals than clause 7 allows
(max 3 changes), apply this priority order. Stop at 3.

## Priority order

1. **Failure-rate fixes** — `update` on roles with `success_rate < 0.7`.
   The harness is currently producing bad work. Fix this first.
2. **Deletions** — `delete` on under-used roles older than 7 days.
3. **Splits** — `split` on over-used roles. Apply before adding new roles.
4. **Additions** — `add` for uncovered prompt clusters.
5. **Merges** — `merge` for overlapping roles. Lowest priority because
   merging loses information.

## Why this order

Each later category depends on earlier ones being clean:

- Don't add a new role if an existing one is failing — fix the failing
  one first
- Don't split until you've removed dead roles
- Don't merge until missing coverage is added

## Tie-breaking within a category

1. Lower invocation count first (less disruption)
2. Older `created_at` first (more observed)
3. Alphabetical role name (deterministic)

## Quiet runs

When zero proposals pass validation, log:

```json
{"ts":"...","verb":"quiet-run","reason":"no proposals passed validation"}
```

The cooldown still ticks from this entry, so the harness gets 24 hours
of stability.
