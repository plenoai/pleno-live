# Harness Constitution

The `governance` skill **cannot** modify this file or violate any
clause below.

The file has two regions:

- **UNIVERSAL** — managed by upstream. `./scripts/update-scaffold.sh`
  overwrites this region. **Do not edit between the BEGIN UNIVERSAL
  and END UNIVERSAL markers.**
- **LOCAL** — managed by this project. Holds the Anchor Circle
  Policies, written in Phase 5. The Anchor Circle Purpose itself
  lives in `.claude/ANCHOR.md`.

<!-- BEGIN UNIVERSAL -->
## Universal invariants

1. The `governance` skill itself must not be deleted, renamed, or
   substantively altered by `governance`. Adding clarifying examples
   is permitted.
2. Every role must declare `name`, `purpose`, and at least one
   `accountability`. Roles missing any are invalid.
3. No two roles may declare overlapping `domain` patterns. The
   Producer/Reviewer pattern is the sole exception, and must be
   declared explicitly in the LOCAL section below if used.
4. All role definitions live under Git version control. Every change
   made by `governance` must produce a commit on a branch named
   `governance/<UTC-date>`.
5. A role may be deleted only after at least 7 calendar days of
   observation in `stats.jsonl`. Roles created less than 7 days ago
   are immune.

## Auto-mode invariants

6. The `governance` skill must not run more than once per 24 hours.
   The `threshold-check.sh` hook enforces this.
7. A single governance run may apply at most 3 changes (additions,
   updates, and deletions combined).
8. The total number of roles must remain in the closed interval [2, 20].
9. `CONSTITUTION.md` UNIVERSAL section, `.claude/ANCHOR.md`,
   `.claude/settings.json`, `.claude/skills/governance/`, and
   `.claude/hooks/` are read-only to `governance`.
10. Deleted role files must be moved to
    `.claude/agents/.archive/<UTC-date>/` and retained for at least 7
    days before any garbage collection.

## Anchor Circle invariants

11. Every role must declare `serves_purpose`, a one-line statement
    connecting the role to the Purpose in `.claude/ANCHOR.md`.
    Validator checks presence only; semantic alignment is the human's
    responsibility.
12. `governance` must not modify `.claude/ANCHOR.md`. The Anchor
    Circle Purpose is authored by the human.

## Decision priority

When multiple proposals conflict in one run, governance applies them
in this order, stopping at clause 7's limit of 3:

1. Failure-rate fixes
2. Deletions
3. Splits
4. Additions
5. Merges

## How invariants are checked

- `hooks/constitution-validator.sh` enforces clauses 1, 2, 9, 10, 11
- `hooks/domain-checker.sh` enforces clause 3
- `tests/governance-tests.sh` enforces clauses 4, 5, 7, 8
<!-- END UNIVERSAL -->

<!-- BEGIN LOCAL -->
## Anchor Circle Policies

13. **Mic exclusivity arbitration.** `packages/lib/recording-session-
    context.tsx` is the sole arbiter of microphone access between
    expo-audio (audio-metering) and ExpoPlayAudioStream (audio-stream).
    No other module may directly request the mic.

14. **TranscriptSegment is the canonical wire shape.**
    `packages/types/realtime-transcription.ts:TranscriptSegment` is the
    only sanctioned shape for transcript data crossing the client/
    server boundary. Server changes that affect it must ship with the
    client change in the same PR.

15. **Native APIs only via `packages/platform/`.** All access to
    Expo / React-Native native APIs from app code or non-platform
    packages must go through `packages/platform/<module>/`. Direct
    `expo-*` / `react-native-*` imports are permitted only inside the
    platform module's own `.native.ts` and `.web.ts` files.

16. **`eas.json` is the build-env single source of truth.** Build-time
    environment variables live in `eas.json`. CI workflows must derive
    env from `eas.json` (e.g. `jq -r '.build.PROFILE.env'`) rather than
    duplicating values in YAML.

<!-- END LOCAL -->
