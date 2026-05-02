# Tension Detection

Six statistical proxies. Starting points for inquiry, not ground truth.

| Tension | Detection rule | Proposal verb |
|---|---|---|
| Over-use | `invocations_30d` for a role > 3 × median across roles, AND ≥ 10 invocations | split |
| Under-use | `invocations_30d == 0` AND `created_at` > 7 days ago | delete |
| Failure | `success_rate < 0.7` AND `invocations_30d ≥ 5` | update |
| Overlap | same role pair > 5 times in `co_invocation` | merge or sharpen |
| Uncovered | ≥ 3 prompts with no Task invocation, semantically related | add |
| Override | git log shows user-edited a generated role file | restore + flag |

## Per-tension notes

### Over-use → split
Look for natural cleavage along sub-domains. Generate 2 child roles
whose accountabilities together cover the parent's, but whose domains
do not overlap. Archive the parent.

### Under-use → delete
Sanity-check against `prompts.jsonl`: if there are recent prompts that
*should* have invoked this role but didn't, the issue may be a poor
`description` field. Update first; delete only if prompts confirm
absence of need.

### Failure → update
Read failures from `stats.jsonl`. Common pattern → tighten the role's
body. Diverse failures → role's purpose is too broad → propose split.

### Overlap → merge or sharpen
Default to **sharpen** (narrow one role's domain). Merging loses
information. Only merge if both purposes are essentially identical.

### Uncovered → add
Cluster uncovered prompts. Multiple clusters → add for the largest
only. Draft `purpose` and `serves_purpose` reusing `.claude/ANCHOR.md`
Purpose vocabulary verbatim where natural.

### Override → restore + flag
Git-revert the offending governance commit at the role file level.
Suppress that proposal kind for 14 days for that role.

## Anti-thrash protection

Same role-name in 3 consecutive governance runs (any verb) → 14-day freeze.
Log:

```json
{"verb":"freeze","role":"<n>","reason":"meta-stability-freeze"}
```

User must un-freeze by editing `governance-log.jsonl`.
