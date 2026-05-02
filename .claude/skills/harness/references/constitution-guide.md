# Constitution Guide

`.claude/CONSTITUTION.md` holds governance rules. The Anchor Circle
Purpose lives separately in `.claude/ANCHOR.md`.

## Two regions

```markdown
<!-- BEGIN UNIVERSAL -->
## Universal invariants
1. ...  12. ...
<!-- END UNIVERSAL -->

<!-- BEGIN LOCAL -->
## Anchor Circle Policies
13. ...
<!-- END LOCAL -->
```

- **UNIVERSAL** — overwritten by `update-scaffold.sh`. Don't edit.
- **LOCAL** — Anchor Circle Policies, written by Phase 5. Numbering
  starts at 13. Never overwritten.

## What goes in LOCAL

Policies derive from the Anchor Circle Purpose / Domains /
Accountabilities. Examples:

```markdown
## Anchor Circle Policies  (research)
13. Every claim must trace to a citation in sources/.
14. Roles must not delete primary sources, only annotate them.

## Anchor Circle Policies  (writing)
13. Producer/Reviewer Domain overlap is permitted between writer and editor on drafts/.
```

A good Policy:

1. Survives role changes (no role-name dependency).
2. Is mechanically checkable.
3. Encodes risk, not preference.
4. Traces to the Anchor Circle.

## What does NOT belong

- Tooling config → `pyproject.toml`, CI, hooks
- Role-specific behavior → role's `description` or body
- Mission/vision-style aspiration → `.claude/ANCHOR.md` Purpose
