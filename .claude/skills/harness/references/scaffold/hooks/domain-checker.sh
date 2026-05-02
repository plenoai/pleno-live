#!/usr/bin/env bash
# domain-checker.sh — Enforces clause 3: no two roles may declare overlapping
# domains. Detects prefix-overlap (e.g. `src/**` vs `src/api/**`), not just
# exact-string equality. Producer/Reviewer exceptions are declared in the
# CONSTITUTION.md LOCAL section as HTML-comment markers:
#   <!-- pr-overlap: <role-a> <role-b> -->
# Pairs listed this way are skipped.
set -e
PROJECT_DIR="${CLAUDE_PROJECT_DIR:-.}"
AGENTS_DIR="$PROJECT_DIR/.claude/agents"
CONSTITUTION="$PROJECT_DIR/.claude/CONSTITUTION.md"

EXTRACT='
  /^---[[:space:]]*$/ { fm = !fm; next }
  fm && /^name:/ { gsub(/^name:[[:space:]]*/, ""); name = $0 }
  fm && /^domains:/ { in_domains = 1; next }
  fm && in_domains && /^[[:space:]]*-/ {
    gsub(/^[[:space:]]*-[[:space:]]*"?/, "")
    gsub(/"?$/, "")
    print name "\t" $0
  }
  fm && in_domains && !/^[[:space:]]*-/ && !/^domains:/ { in_domains = 0 }
'

PAIRS=$(
  for f in "$AGENTS_DIR"/*.md; do
    [ -e "$f" ] || continue
    awk "$EXTRACT" "$f"
  done
)

# Producer/Reviewer overlap allowlist from CONSTITUTION.md LOCAL section.
PR_OVERLAPS=""
if [ -f "$CONSTITUTION" ]; then
  PR_OVERLAPS=$(awk '
    /<!-- BEGIN LOCAL -->/ { in_local = 1; next }
    /<!-- END LOCAL -->/   { in_local = 0 }
    in_local && match($0, /<!--[[:space:]]*pr-overlap:[[:space:]]*[^[:space:]]+[[:space:]]+[^[:space:]]+[[:space:]]*-->/) {
      s = substr($0, RSTART, RLENGTH)
      sub(/^<!--[[:space:]]*pr-overlap:[[:space:]]*/, "", s)
      sub(/[[:space:]]*-->[[:space:]]*$/, "", s)
      print s
    }
  ' "$CONSTITUTION")
fi

DUPS=$(printf '%s\n' "$PAIRS" | awk -F'\t' \
  -v allowed="$PR_OVERLAPS" '
  BEGIN {
    n_allow = 0
    n = split(allowed, lines, /\n/)
    for (i = 1; i <= n; i++) {
      if (lines[i] == "") continue
      m = split(lines[i], parts, /[[:space:]]+/)
      if (m >= 2 && parts[1] != "" && parts[2] != "") {
        n_allow++
        a1[n_allow] = parts[1]
        a2[n_allow] = parts[2]
      }
    }
    n_pairs = 0
  }
  function normalize(d,    out) {
    out = d
    sub(/\/\*\*$/, "", out)
    sub(/\/\*$/,   "", out)
    sub(/\/$/,     "", out)
    return out
  }
  function overlaps(a, b,    na, nb) {
    if (a == "" || b == "") return 0
    na = normalize(a)
    nb = normalize(b)
    if (na == "" || nb == "") return 1
    if (na == nb) return 1
    if (substr(nb, 1, length(na) + 1) == na "/") return 1
    if (substr(na, 1, length(nb) + 1) == nb "/") return 1
    return 0
  }
  function is_allowed(ra, rb,    i) {
    for (i = 1; i <= n_allow; i++) {
      if ((a1[i] == ra && a2[i] == rb) || (a1[i] == rb && a2[i] == ra)) return 1
    }
    return 0
  }
  $1 != "" && $2 != "" {
    n_pairs++
    role[n_pairs] = $1
    dom[n_pairs]  = $2
  }
  END {
    bad = 0
    for (i = 1; i <= n_pairs; i++) {
      for (j = i + 1; j <= n_pairs; j++) {
        if (role[i] == role[j]) continue
        if (overlaps(dom[i], dom[j])) {
          if (is_allowed(role[i], role[j])) continue
          printf "conflict: %s domain %s overlaps %s domain %s\n", role[i], dom[i], role[j], dom[j]
          bad = 1
        }
      }
    }
    exit bad
  }
') || {
  printf '%s\n' "$DUPS" >&2
  echo "violation of clause 3: domain overlap" >&2
  exit 1
}
exit 0
