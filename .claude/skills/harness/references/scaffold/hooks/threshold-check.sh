#!/usr/bin/env bash
# threshold-check.sh — SessionEnd hook. 24h cooldown + threshold + detached governance.
set -e
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
LOG="$PROJECT_DIR/.claude/state/governance-log.jsonl"
RUNS_LOG="$PROJECT_DIR/.claude/state/governance-runs.log"
mkdir -p "$(dirname "$LOG")"

# Parse ISO 8601 → epoch seconds. Portable across GNU/BSD date.
iso_to_epoch() {
  python3 -c '
import sys, datetime
try:
    s = sys.argv[1].replace("Z", "+00:00")
    print(int(datetime.datetime.fromisoformat(s).timestamp()))
except Exception:
    print(0)
' "$1"
}

# Cooldown (clause 6)
if [ -s "$LOG" ]; then
  LAST_TS=$(tail -n 1 "$LOG" | jq -r '.ts // empty' 2>/dev/null || echo "")
  if [ -n "$LAST_TS" ]; then
    NOW_S=$(date -u +%s)
    LAST_S=$(iso_to_epoch "$LAST_TS")
    if [ "$LAST_S" -gt 0 ]; then
      DELTA=$((NOW_S - LAST_S))
      if [ "$DELTA" -lt 86400 ]; then exit 0; fi
    fi
  fi
fi

# Threshold check
if ! python3 "$PROJECT_DIR/.claude/hooks/check_thresholds.py"; then exit 0; fi

# Auto-run is opt-in. Governance writing files autonomously is reversible
# (commit on a branch). Letting it spawn with bypassPermissions in the
# background is a different ballgame — require an explicit signal.
if [ "${GOVERNANCE_AUTO_RUN:-0}" != "1" ]; then
  echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"verb\":\"threshold-trip\",\"reason\":\"GOVERNANCE_AUTO_RUN!=1, skipping detached run\"}" >> "$LOG"
  exit 0
fi

# Detached governance. Permission mode is configurable; default acceptEdits
# (governance only mutates .claude/agents/ and runs vetted Bash via its
# allowed-tools allowlist). Set GOVERNANCE_PERMISSION_MODE=bypassPermissions
# to widen.
PERM_MODE="${GOVERNANCE_PERMISSION_MODE:-acceptEdits}"
# Record detached-start in governance-log.jsonl so the 24h cooldown sees this
# run on the next SessionEnd (otherwise multiple detached runs could stack
# within a single day).
echo "{\"ts\":\"$(date -u +%FT%TZ)\",\"verb\":\"governance-detached-start\",\"permission_mode\":\"$PERM_MODE\"}" >> "$LOG"
(
  timeout 1800 claude -p "/governance auto-run" \
    --permission-mode "$PERM_MODE" \
    --output-format stream-json \
    >> "$RUNS_LOG" 2>&1
) &
disown
exit 0
