#!/usr/bin/env bash
# governance-tests.sh — Regression tests gating governance commits. Clauses 4, 5, 7, 8.
set -e
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
AGENTS_DIR="$PROJECT_DIR/.claude/agents"
LOG="$PROJECT_DIR/.claude/state/governance-log.jsonl"

failed=0
fail() { echo "FAIL: $1" >&2; failed=1; }

# Clause 8
ROLE_COUNT=$(find "$AGENTS_DIR" -maxdepth 1 -name '*.md' -type f 2>/dev/null | wc -l)
[ "$ROLE_COUNT" -lt 2 ] && fail "clause 8: role count $ROLE_COUNT below minimum 2"
[ "$ROLE_COUNT" -gt 20 ] && fail "clause 8: role count $ROLE_COUNT above maximum 20"

# Clause 4
[ ! -d "$PROJECT_DIR/.git" ] && fail "clause 4: not a git repository"

# Clause 7 — most recent run applied at most 3 changes. Key on the last
# record's `branch` (governance/<UTC-date>) and count only entries that
# were actually applied with a change verb. The previous minute-prefix
# heuristic conflated unrelated runs and counted rejected proposals.
if [ -s "$LOG" ]; then
  LAST_BRANCH=$(tail -n 1 "$LOG" | jq -r '.branch // empty' 2>/dev/null)
  if [ -n "$LAST_BRANCH" ] && [ "$LAST_BRANCH" != "null" ]; then
    LAST_RUN_COUNT=$(jq -r --arg b "$LAST_BRANCH" '
      select(
        .branch == $b and
        .status == "applied" and
        (.verb == "add" or .verb == "update" or .verb == "delete" or
         .verb == "split" or .verb == "merge")
      ) | 1
    ' "$LOG" 2>/dev/null | wc -l | tr -d " ")
    [ -z "$LAST_RUN_COUNT" ] && LAST_RUN_COUNT=0
    [ "$LAST_RUN_COUNT" -gt 3 ] && fail "clause 7: most recent run applied $LAST_RUN_COUNT changes (max 3)"
  fi
fi

# Clause 10 — archive directories must be YYYY-MM-DD. Portable across GNU/BSD date.
if [ -d "$AGENTS_DIR/.archive" ]; then
  for d in "$AGENTS_DIR/.archive"/*; do
    [ -d "$d" ] || continue
    DIR_DATE=$(basename "$d")
    DIR_OK=$(python3 -c '
import sys, datetime
try:
    datetime.date.fromisoformat(sys.argv[1])
    print(1)
except Exception:
    print(0)
' "$DIR_DATE")
    [ "$DIR_OK" != "1" ] && fail "clause 10: archive dir name not a valid date: $d"
  done
fi
exit $failed
