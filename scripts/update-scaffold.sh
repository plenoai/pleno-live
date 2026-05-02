#!/usr/bin/env bash
# update-scaffold.sh
# Pulls scaffold updates from the harness skill installed via gh skill.
# Updates: CONSTITUTION UNIVERSAL section, hooks/, tests/, this script itself.
# Preserves: .claude/agents/, .claude/state/, CONSTITUTION LOCAL section,
#            .claude/ANCHOR.md (Anchor Circle declaration — never overwritten).
set -e

# Locate the installed harness skill
SCAFFOLD=""
for c in \
  "$HOME/.claude/skills/harness/references/scaffold" \
  ".claude/skills/harness/references/scaffold"; do
  if [ -d "$c" ]; then SCAFFOLD="$c"; break; fi
done

if [ -z "$SCAFFOLD" ]; then
  echo "✗ harness skill not found locally."
  echo "  Install: gh skill install HikaruEgashira/holacracy-harness harness --agent claude-code --scope user"
  exit 1
fi

echo "→ using scaffold from: $SCAFFOLD"

# === 1. Update CONSTITUTION.md UNIVERSAL section only ===
LOCAL_FILE=".claude/CONSTITUTION.md"
UPSTREAM_FILE="$SCAFFOLD/CONSTITUTION.md"

if [ ! -f "$LOCAL_FILE" ]; then
  echo "✗ no .claude/CONSTITUTION.md in this project. Aborting."
  exit 1
fi

UPSTREAM_UNIVERSAL=$(awk '
  /<!-- BEGIN UNIVERSAL -->/ { in_block=1 }
  in_block { print }
  /<!-- END UNIVERSAL -->/ { in_block=0 }
' "$UPSTREAM_FILE")

if [ -z "$UPSTREAM_UNIVERSAL" ]; then
  echo "✗ upstream CONSTITUTION.md has no BEGIN UNIVERSAL marker. Aborting."
  exit 1
fi

# Use a unique sentinel approach: write upstream block to a tempfile,
# then sed-replace the local block with that file's contents.
TMP_BLOCK=$(mktemp)
trap 'rm -f "$TMP_BLOCK"' EXIT
printf '%s\n' "$UPSTREAM_UNIVERSAL" > "$TMP_BLOCK"

python3 - "$LOCAL_FILE" "$TMP_BLOCK" <<'PY'
import sys, re, pathlib
local_path = pathlib.Path(sys.argv[1])
block_path = pathlib.Path(sys.argv[2])
upstream_universal = block_path.read_text(encoding="utf-8")
local = local_path.read_text(encoding="utf-8")
pattern = re.compile(
    r"<!-- BEGIN UNIVERSAL -->.*?<!-- END UNIVERSAL -->",
    re.DOTALL,
)
if not pattern.search(local):
    print("✗ local CONSTITUTION.md has no UNIVERSAL markers. Aborting.", file=sys.stderr)
    sys.exit(1)
new = pattern.sub(upstream_universal.strip(), local)
local_path.write_text(new, encoding="utf-8")
print("  ✓ CONSTITUTION.md UNIVERSAL section updated")
PY

# === 2. Update hooks ===
# `set -e` (top of script) aborts on any failure; success echo only fires on
# clean refresh. mkdir -p creates the target dir if missing.
if [ -d "$SCAFFOLD/hooks" ]; then
  mkdir -p .claude/hooks
  cp -f "$SCAFFOLD/hooks/"*.sh .claude/hooks/
  cp -f "$SCAFFOLD/hooks/"*.py .claude/hooks/
  chmod +x .claude/hooks/*.sh .claude/hooks/*.py
  echo "  ✓ hooks/ refreshed"
fi

# === 3. Update tests ===
if [ -d "$SCAFFOLD/tests" ]; then
  mkdir -p tests
  cp -f "$SCAFFOLD/tests/"*.sh tests/
  chmod +x tests/*.sh
  echo "  ✓ tests/ refreshed"
fi

# === 4. Refresh settings.json ===
cp -f "$SCAFFOLD/settings.json" .claude/settings.json
echo "  ✓ settings.json refreshed"

# === 5. Ensure .claude/.gitignore exists (do not overwrite if user customized) ===
# Source file is `gitignore` (no leading dot) for distribution safety; rename on copy.
if [ ! -f .claude/.gitignore ] && [ -f "$SCAFFOLD/gitignore" ]; then
  cp "$SCAFFOLD/gitignore" .claude/.gitignore
  echo "  ✓ wrote .claude/.gitignore (state/ excluded)"
fi

# === 6. Ensure .claude/ANCHOR.md exists (NEVER overwrite — human-authored) ===
# The Anchor Circle Purpose lives here. Constitution clause 12 forbids
# upstream and governance from modifying it.
if [ ! -f .claude/ANCHOR.md ] && [ -f "$SCAFFOLD/ANCHOR.md" ]; then
  cp "$SCAFFOLD/ANCHOR.md" .claude/ANCHOR.md
  echo "  ✓ wrote .claude/ANCHOR.md (template — fill in your Anchor Circle Purpose)"
fi

# Note: we do NOT overwrite this script itself or update-scaffold.sh,
# because we are currently executing it. To update update-scaffold.sh,
# run: cp "$SCAFFOLD/scripts/update-scaffold.sh" scripts/update-scaffold.sh

echo
echo "✓ Scaffold updated. Review with: git diff"
echo "  Untouched: .claude/agents/, .claude/state/, .claude/ANCHOR.md, CONSTITUTION LOCAL section"
