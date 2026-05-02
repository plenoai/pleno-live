# Role Arrangement Heuristics

Non-normative aids for Phase 2. Not Holacracy primitives. `governance`
does not consult this file.

Pick **one** layout per project. Mixing is discouraged at design time;
governance can introduce hybrids later.

## 1. Pipeline
Sequential roles, each output feeds the next.
**Use when:** the Purpose decomposes into stages.

```
[ research ] → [ draft ] → [ polish ]
```

## 2. Fan-out / Fan-in
Parallel roles + one integrator.
**Use when:** independent investigations need consolidation.
**Constraint:** integrator owns the merged artifact's domain.

## 3. Expert Pool
Specialists dispatched contextually. No fixed sequence.
**Use when:** incoming work varies.
**Constraint:** specialist domains must not overlap. Dispatch is by
main Claude — no dispatcher role.

## 4. Producer / Reviewer
One produces, one critiques. Iterate until sign-off.
**Use when:** the Purpose holds quality as non-negotiable.
**Constraint:** Domain overlap. The only sanctioned exception to
clause 3, declared as an Anchor Circle Policy in CONSTITUTION LOCAL.

## 5. Supervisor
Coordinator role holds the plan; specialists do the work.
**Use when:** sequence depends on intermediate results.
**Constraint:** supervisor's domain is the **plan** (e.g. `PLAN.md`),
not the artifacts.

## 6. Network
Peer-to-peer based on accountabilities.
**Use when:** exploratory, no natural sequence.
**Constraint:** each role declares accepted request kinds in
`accountabilities`. Most flexible, hardest to keep coherent.

## Choosing

| Anchor Circle Purpose is... | Use |
|---|---|
| linear and staged | Pipeline |
| multi-perspective | Fan-out / Fan-in |
| reactive and varied | Expert Pool |
| quality-critical | Producer / Reviewer |
| dynamic and uncertain | Supervisor |
| exploratory | Network |

Default to **Expert Pool** with 3 roles when uncertain.

## Anti-patterns

- **Sub-circles** — flat-namespace constraint forbids them in this harness.
- **All-purpose role** — governance will flag `over-use` and split.
- **Pattern-as-Purpose** — choosing a layout before running Phase 1.
