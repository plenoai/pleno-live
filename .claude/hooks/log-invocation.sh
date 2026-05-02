#!/usr/bin/env bash
# log-invocation.sh — PostToolUse(Task) hook. Appends one record to stats.jsonl.
# Hook failures must never block the session, but should be debuggable —
# stderr goes to hook-errors.log instead of /dev/null.
set -u
STATE_DIR="${CLAUDE_PROJECT_DIR:-.}/.claude/state"
STATS_FILE="$STATE_DIR/stats.jsonl"
ERR_LOG="$STATE_DIR/hook-errors.log"
mkdir -p "$STATE_DIR"

INPUT=$(cat)
if ! echo "$INPUT" | jq -c --arg ts "$(date -u +%FT%TZ)" '
  {
    ts: $ts,
    role: (.tool_input.subagent_type // .tool_input.agent // "unknown"),
    success: (
      if (.tool_response.is_error // false) then false
      elif (.tool_response.error // null) != null then false
      else true
      end
    ),
    duration_ms: (.duration_ms // 0),
    session_id: (.session_id // "unknown")
  }
' >> "$STATS_FILE" 2>>"$ERR_LOG"; then
  printf '[%s] log-invocation: jq failed\n' "$(date -u +%FT%TZ)" >> "$ERR_LOG"
fi
exit 0
