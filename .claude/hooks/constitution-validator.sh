#!/usr/bin/env bash
# constitution-validator.sh — Verifies a role file against clauses 1, 2, 9, 10, 11.
set -e
FILE="$1"
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
[ -z "$FILE" ] && { echo "usage: $0 <role-file>" >&2; exit 2; }

# Clause 9: protected paths
case "$FILE" in
  *CONSTITUTION.md|*ANCHOR.md|*settings.json)
    echo "violation of clause 9: protected file $FILE" >&2; exit 1;;
  */hooks/*|*/skills/governance/*)
    echo "violation of clause 9: protected directory $FILE" >&2; exit 1;;
esac

# Clause 1: governance SKILL.md must exist somewhere
GOV_SKILL_PROJ="$PROJECT_DIR/.claude/skills/governance/SKILL.md"
GOV_SKILL_USER="$HOME/.claude/skills/governance/SKILL.md"
if [ ! -f "$GOV_SKILL_PROJ" ] && [ ! -f "$GOV_SKILL_USER" ]; then
  echo "violation of clause 1: governance SKILL.md missing" >&2
  echo "  install via: gh skill install HikaruEgashira/holacracy-harness governance --agent claude-code --scope user" >&2
  exit 1
fi

# Clause 12 prerequisite: ANCHOR.md must exist (Anchor Circle declaration)
ANCHOR="$PROJECT_DIR/.claude/ANCHOR.md"
if [ ! -f "$ANCHOR" ]; then
  echo "scaffold incomplete: $ANCHOR missing" >&2
  echo "  re-run the harness skill, or copy from skills/harness/references/scaffold/ANCHOR.md" >&2
  exit 1
fi

# Clause 2: required frontmatter fields. Restrict checks to the YAML
# frontmatter block (between the leading and trailing '---') so the role
# body cannot accidentally satisfy a missing field.
if [ -f "$FILE" ]; then
  FM=$(awk '/^---[[:space:]]*$/ { c++; next } c == 1 { print } c >= 2 { exit }' "$FILE")
  if [ -z "$FM" ]; then
    echo "violation of clause 2: missing or empty YAML frontmatter in $FILE" >&2
    exit 1
  fi

  for field in name purpose accountabilities; do
    if ! printf '%s\n' "$FM" | grep -q "^${field}:"; then
      echo "violation of clause 2: missing field '${field}' in $FILE" >&2
      exit 1
    fi
  done

  # Accountabilities must have ≥ 1 list item.
  ACC_COUNT=$(printf '%s\n' "$FM" | awk '
    /^accountabilities:/ { in_acc = 1; next }
    in_acc && /^[A-Za-z_][A-Za-z0-9_]*:/ { in_acc = 0 }
    in_acc && /^[[:space:]]+-[[:space:]]+/ { n++ }
    END { print n + 0 }
  ')
  if [ "${ACC_COUNT:-0}" -lt 1 ]; then
    echo "violation of clause 2: accountabilities must have ≥ 1 item in $FILE" >&2
    exit 1
  fi

  # Clause 11: serves_purpose must be present.
  # Default: warn (1-release grace period for pre-clause-11 role files).
  # Strict: HARNESS_STRICT_PURPOSE=1 → fail.
  if ! printf '%s\n' "$FM" | grep -q "^serves_purpose:"; then
    if [ "${HARNESS_STRICT_PURPOSE:-0}" = "1" ]; then
      echo "violation of clause 11: missing 'serves_purpose' in $FILE" >&2
      exit 1
    else
      echo "warning (clause 11): missing 'serves_purpose' in $FILE" >&2
      echo "  set HARNESS_STRICT_PURPOSE=1 to make this a hard failure" >&2
    fi
  fi
fi
exit 0
