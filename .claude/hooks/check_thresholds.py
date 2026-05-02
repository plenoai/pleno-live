#!/usr/bin/env python3
"""
check_thresholds.py

Returns exit 0 if any tension threshold is breached (governance should run),
else exit 1. Conservative thresholds: small samples produce no signal.
"""
from __future__ import annotations

import json
import os
import statistics
import sys
from datetime import datetime, timedelta, timezone
from pathlib import Path

WINDOW_DAYS = 30
MIN_INVOCATIONS_FOR_FAILURE_SIGNAL = 5
MIN_INVOCATIONS_FOR_OVERUSE_SIGNAL = 10
OVERUSE_MULTIPLIER = 3.0
SUCCESS_THRESHOLD = 0.7
UNCOVERED_CLUSTER_SIZE = 3
ROLE_AGE_FOR_DELETION_DAYS = 7

PROJECT_DIR = Path(os.environ.get("CLAUDE_PROJECT_DIR", "."))
STATS = PROJECT_DIR / ".claude/state/stats.jsonl"
PROMPTS = PROJECT_DIR / ".claude/state/prompts.jsonl"
AGENTS_DIR = PROJECT_DIR / ".claude/agents"


def load_jsonl(path):
    if not path.exists():
        return []
    out = []
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line:
            continue
        try:
            out.append(json.loads(line))
        except json.JSONDecodeError:
            continue
    return out


def parse_ts(s):
    try:
        dt = datetime.fromisoformat(str(s).replace("Z", "+00:00"))
    except (ValueError, TypeError, AttributeError):
        return None
    if dt.tzinfo is None:
        return None
    return dt.astimezone(timezone.utc)


def within_window(record, cutoff):
    ts = parse_ts(record.get("ts", ""))
    return ts is not None and ts >= cutoff


def detect_overuse(stats_in_window):
    counts = {}
    for r in stats_in_window:
        role = r.get("role")
        if not role:
            continue
        counts[role] = counts.get(role, 0) + 1
    if len(counts) < 3:
        return False
    values = list(counts.values())
    median = statistics.median(values)
    if median == 0:
        return False
    threshold = OVERUSE_MULTIPLIER * median
    return any(
        v >= threshold and v >= MIN_INVOCATIONS_FOR_OVERUSE_SIGNAL
        for v in values
    )


def detect_underuse(stats_in_window):
    used = {r.get("role") for r in stats_in_window if r.get("role")}
    if not AGENTS_DIR.exists():
        return False
    cutoff_age = datetime.now(timezone.utc) - timedelta(
        days=ROLE_AGE_FOR_DELETION_DAYS
    )
    for f in AGENTS_DIR.glob("*.md"):
        mtime = datetime.fromtimestamp(f.stat().st_mtime, tz=timezone.utc)
        if mtime > cutoff_age:
            continue
        if f.stem not in used:
            return True
    return False


def detect_failure(stats_in_window):
    by_role = {}
    for r in stats_in_window:
        role = r.get("role")
        if not role:
            continue
        by_role.setdefault(role, []).append(bool(r.get("success", True)))
    for results in by_role.values():
        if len(results) < MIN_INVOCATIONS_FOR_FAILURE_SIGNAL:
            continue
        rate = sum(results) / len(results)
        if rate < SUCCESS_THRESHOLD:
            return True
    return False


def detect_uncovered(prompts_in_window, stats_in_window):
    sessions_with_task = {
        r.get("session_id") for r in stats_in_window if r.get("session_id")
    }
    uncovered = [
        p for p in prompts_in_window
        if p.get("session_id") not in sessions_with_task
    ]
    return len(uncovered) >= UNCOVERED_CLUSTER_SIZE


def main():
    cutoff = datetime.now(timezone.utc) - timedelta(days=WINDOW_DAYS)
    stats = [r for r in load_jsonl(STATS) if within_window(r, cutoff)]
    prompts = [r for r in load_jsonl(PROMPTS) if within_window(r, cutoff)]

    signals = {
        "overuse": detect_overuse(stats),
        "underuse": detect_underuse(stats),
        "failure": detect_failure(stats),
        "uncovered": detect_uncovered(prompts, stats),
    }

    if any(signals.values()):
        print(
            "tension detected: " + ",".join(k for k, v in signals.items() if v),
            file=sys.stderr,
        )
        return 0
    return 1


if __name__ == "__main__":
    sys.exit(main())
