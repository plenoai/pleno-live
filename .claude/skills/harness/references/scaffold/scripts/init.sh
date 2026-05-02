#!/usr/bin/env bash
# init.sh — Bootstrap helper. Run after the harness skill has populated .claude/.
set -e

# Make scripts executable
chmod +x .claude/hooks/*.sh .claude/hooks/*.py tests/*.sh scripts/*.sh

# Ensure state/ exists
mkdir -p .claude/state .claude/agents
touch .claude/state/.gitkeep

# Ensure runtime state stays out of git (PII protection)
GITIGNORE=".claude/.gitignore"
if [ ! -f "$GITIGNORE" ]; then
  cat > "$GITIGNORE" <<'EOF'
# Scaffold runtime state. Contains user prompts and stats — never commit.
state/
agents/.archive/
EOF
  echo "  ✓ wrote .claude/.gitignore (state/ excluded)"
fi

# Verify governance skill is installed
GOV_PROJ=".claude/skills/governance/SKILL.md"
GOV_USER="$HOME/.claude/skills/governance/SKILL.md"
if [ ! -f "$GOV_PROJ" ] && [ ! -f "$GOV_USER" ]; then
  echo
  echo "! governance skill not found. Install with:"
  echo "    gh skill install HikaruEgashira/holacracy-harness governance --agent claude-code --scope user"
  echo
fi

# Verify git is initialized (clause 4)
if [ ! -d .git ]; then
  echo "! this is not a git repository. Initialize with: git init"
fi

echo "✓ scaffold bootstrap complete"
