#!/usr/bin/env bash
# log-prompt.sh — UserPromptSubmit hook. Records prompts for "uncovered" tension.
# Hook failures must never block the session, but should be debuggable —
# stderr goes to hook-errors.log instead of /dev/null.
set -u
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
PROMPTS_FILE="$STATE_DIR/prompts.jsonl"
ERR_LOG="$STATE_DIR/hook-errors.log"
mkdir -p "$STATE_DIR"

INPUT=$(cat)
if ! echo "$INPUT" | jq -c --arg ts "$(date -u +%FT%TZ)" '
  {
    ts: $ts,
    prompt: (.prompt // .user_prompt // ""),
    session_id: (.session_id // "unknown")
  }
' >> "$PROMPTS_FILE" 2>>"$ERR_LOG"; then
  printf '[%s] log-prompt: jq failed\n' "$(date -u +%FT%TZ)" >> "$ERR_LOG"
fi
exit 0
