---
name: harness
description: Designs a Holacracy Anchor Circle for a Claude Code project and writes the runtime scaffold. Triggered by "build a harness", "set up a harness", "ハーネスを構成して", "ロール構成を設計して".
---

# harness

Layer 1 of the holacracy-harness. Facilitates the human (the Anchor
Circle's Lead Link) through six phases: elicit the Anchor Circle
Purpose, design 3–5 roles that serve it, write the scaffold, validate.

The human authors the Anchor Circle Purpose. You facilitate; you do
not author it for them.

Layer 2 (`governance`) takes over after Phase 6 and evolves the role
set, bounded by `.claude/CONSTITUTION.md` and informed by
`.claude/ANCHOR.md`.

## Triggers

- "build a harness for this project"
- "set up a harness"
- "design an agent team"
- "ハーネスを構成して" / "ロール構成を設計して"

## Six-Phase Workflow

### Phase 1 — Anchor Circle Articulation

Elicit, in the user's language, in this order:

1. **Purpose** *(required, one sentence, future-state)* — reject
   procedures, slogans, multi-sentence answers.
2. **Domains** *(optional, often empty)* — resources owned by the
   organization-as-a-whole.
3. **Accountabilities** *(optional, often empty)* — obligations held
   at the whole level.
4. **Out of bounds** *(optional)* — captured for Phase 5.

Write into `.claude/ANCHOR.md` between BEGIN/END markers using
`references/scaffold/ANCHOR.md`. Confirm with the user before Phase 2.

### Phase 2 — Role Architecture Design

Ask: *"What capacities does this Purpose require that no single
existing role can supply?"* Pick one layout from
`references/role-design-patterns.md` (non-normative aids). Sketch 3–5
roles, each with:

- `purpose` (future-state sentence)
- `serves_purpose` (one line tying to the Anchor Circle Purpose;
  reuse Anchor vocabulary verbatim where natural)
- `accountabilities` (≥ 1)
- `domains` (≥ 0)

See `references/role-template.md`. Constraints: flat namespace,
domain exclusivity (clause 3), Producer/Reviewer overlap requires a
LOCAL Policy declaration. Confirm with the user before writing files.

### Phase 3 — Scaffold Installation

Resolve scaffold path:

```bash
SKILL_ROOT_CANDIDATES=(
  ".claude/skills/harness/references/scaffold"
  "$HOME/.claude/skills/harness/references/scaffold"
  "${CLAUDE_PLUGIN_ROOT:-/dev/null}/references/scaffold"
)
for c in "${SKILL_ROOT_CANDIDATES[@]}"; do
  if [ -d "$c" ]; then SCAFFOLD="$c"; break; fi
done
```

Copy idempotently:

```bash
mkdir -p .claude/hooks .claude/state .claude/agents tests scripts
cp -n "$SCAFFOLD/CONSTITUTION.md" .claude/CONSTITUTION.md
cp -n "$SCAFFOLD/ANCHOR.md"       .claude/ANCHOR.md
cp -n "$SCAFFOLD/settings.json"   .claude/settings.json
cp -n "$SCAFFOLD/gitignore"       .claude/.gitignore
cp -n "$SCAFFOLD/hooks/"*.sh "$SCAFFOLD/hooks/"*.py .claude/hooks/
cp -n "$SCAFFOLD/tests/"*.sh tests/
cp -n "$SCAFFOLD/scripts/"*.sh scripts/
chmod +x .claude/hooks/*.sh .claude/hooks/*.py tests/*.sh scripts/*.sh
touch .claude/state/.gitkeep
```

`-n` preserves the Phase 1 Anchor Circle draft.

The governance skill is installed separately:

```bash
gh skill install HikaruEgashira/holacracy-harness governance \
  --agent claude-code --scope user
```

Tell the user if it isn't already at `~/.claude/skills/governance/SKILL.md`
or `.claude/skills/governance/SKILL.md`.

### Phase 4 — Role File Generation

Write each Phase 2 role to `.claude/agents/<n>.md` per the template.
Set `created_at` to today (UTC). `serves_purpose` is required (clause
11) and should reuse Anchor Circle Purpose vocabulary verbatim where
natural.

### Phase 5 — Anchor Circle Policies

Append rules surfaced in Phase 1 as numbered clauses (starting at 13)
between the BEGIN/END LOCAL markers in `.claude/CONSTITUTION.md`.
Never edit UNIVERSAL.

If the layout is **Producer/Reviewer**, declare the permitted
overlapping pair as a Policy here, otherwise the domain-checker hook
will reject.

### Phase 6 — Validation & Smoke Test

```bash
for f in .claude/agents/*.md; do
  .claude/hooks/constitution-validator.sh "$f"
done
.claude/hooks/domain-checker.sh
tests/governance-tests.sh
```

Common fixes: missing required fields → re-emit; domain overlap →
narrow or declare Policy; ANCHOR.md missing → re-run Phase 3.

End with 2–3 smoke-test prompts, each designed to invoke one role.

## Updating later

`./scripts/update-scaffold.sh` refreshes UNIVERSAL, hooks, tests.
Preserves `.claude/agents/`, `.claude/state/`, CONSTITUTION LOCAL,
and `.claude/ANCHOR.md`. `gh skill update --all` refreshes the skills
themselves.

## What you do not do

- Author the Anchor Circle Purpose for the user.
- Edit `.claude/ANCHOR.md` after Phase 1 confirmation.
- Generate roles unrelated to the Purpose.
- Exceed 5 initial roles.
- Edit UNIVERSAL, hooks, or governance skill files.
- Create sub-circles.
