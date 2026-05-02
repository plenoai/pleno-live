# Tension Types

Six statistical proxies for tensions, used by `governance` to drive
role evolution.

| Proxy | Detection | Verb |
|---|---|---|
| Over-use | `invocations_30d` > 3 × median, ≥ 10 invocations | split |
| Under-use | `invocations_30d == 0`, age > 7 days | delete |
| Failure | `success_rate < 0.7`, `invocations_30d ≥ 5` | update |
| Overlap | role pair > 5 times in `co_invocation` | merge or sharpen |
| Uncovered | ≥ 3 prompts with no Task invocation, semantically related | add |
| Override | git log shows user-edited a generated role file | restore + flag |

`Uncovered` is the strongest signal that the Anchor Circle Purpose
calls for a sensing capacity not yet present. When governance adds a
role, it drafts `serves_purpose` reusing language from
`.claude/ANCHOR.md` verbatim where natural.

## Layout-specific tendencies

Following the layouts in `role-design-patterns.md`:

- **Pipeline** — over-use on the bottleneck stage; design that role's
  accountabilities to be splittable.
- **Expert Pool** — uncovered prompts as needs surface; keep roles
  narrow so adding new ones is cheap.
- **Producer/Reviewer** — override tension if reviewer is too strict.
- **Supervisor** — over-use on the supervisor itself signals unclear
  specialist domains; sharpen at design time.

The harness caps initial roles at 5; governance grows the set as data
justifies.
