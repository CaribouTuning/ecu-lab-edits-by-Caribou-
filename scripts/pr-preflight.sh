#!/usr/bin/env bash
#
# Fork-local. Checks that the current branch will open a clean pull request
# against DNiev/ecu-lab, before the compare link is handed to Turtle.GTI.
#
#   ./scripts/pr-preflight.sh            # check the current branch
#   ./scripts/pr-preflight.sh --gates    # also run the four CI gates
#
# Exits non-zero if the branch would conflict or carries fork-local files.

set -uo pipefail

UPSTREAM_URL="https://github.com/DNiev/ecu-lab"
UPSTREAM_BRANCH="main"
FORK_SLUG="CaribouTuning:ecu-lab-edits-by-Caribou-"

# Paths that exist only on this fork and must never reach an upstream diff.
FORK_LOCAL=(
  "CLAUDE.md"
  "docs/audit/"
  "scripts/pr-preflight.sh"
)

RUN_GATES=0
[ "${1:-}" = "--gates" ] && RUN_GATES=1

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

fail=0

cd "$(git rev-parse --show-toplevel)" || exit 1

BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" = "main" ]; then
  red "✗ You are on main. Cut a PR branch from upstream/${UPSTREAM_BRANCH} first:"
  echo "    git fetch upstream ${UPSTREAM_BRANCH}"
  echo "    git checkout -b <branch> upstream/${UPSTREAM_BRANCH}"
  exit 1
fi

if [ -n "$(git status --porcelain)" ]; then
  red "✗ Working tree is dirty. Commit or stash before preflighting."
  exit 1
fi

bold "Branch: ${BRANCH}"

# --- upstream remote -------------------------------------------------------
if ! git remote get-url upstream >/dev/null 2>&1; then
  echo "  adding upstream remote -> ${UPSTREAM_URL}"
  git remote add upstream "$UPSTREAM_URL"
fi
echo "  fetching upstream/${UPSTREAM_BRANCH} ..."
if ! git fetch --quiet upstream "$UPSTREAM_BRANCH" 2>/dev/null; then
  red "✗ Could not fetch ${UPSTREAM_URL}. Check the network, then retry."
  exit 1
fi
UPSTREAM_REF="upstream/${UPSTREAM_BRANCH}"
echo

# --- 1. will it merge cleanly? --------------------------------------------
bold "1. Merge cleanliness"
if git merge-base --is-ancestor "$UPSTREAM_REF" HEAD; then
  green "  ✓ Fast-forward. Branch sits directly on top of ${UPSTREAM_REF} — no conflicts possible."
else
  BEHIND=$(git rev-list --count "HEAD..${UPSTREAM_REF}")
  echo "  Branch is ${BEHIND} commit(s) behind ${UPSTREAM_REF}; testing a trial merge ..."
  if MERGE_OUT=$(git merge-tree --write-tree "$UPSTREAM_REF" HEAD 2>&1); then
    green "  ✓ Merges cleanly (no conflicts), though not a fast-forward."
    echo "    To make it a fast-forward: git rebase ${UPSTREAM_REF}"
  else
    red "  ✗ CONFLICTS. This PR would land on Turtle.GTI with conflicts:"
    echo "$MERGE_OUT" | grep -E '^(CONFLICT|Auto-merging)' | sed 's/^/      /'
    echo "    Fix with: git rebase ${UPSTREAM_REF}"
    fail=1
  fi
fi
echo

# --- 2. what the PR would contain -----------------------------------------
bold "2. Commits the PR would contain"
COMMITS=$(git log --oneline "${UPSTREAM_REF}..HEAD")
if [ -z "$COMMITS" ]; then
  red "  ✗ No commits ahead of ${UPSTREAM_REF} — nothing to open a PR with."
  fail=1
else
  echo "$COMMITS" | sed 's/^/    /'
fi
echo

bold "3. Files the PR would change"
FILES=$(git diff --name-only "${UPSTREAM_REF}...HEAD")
if [ -z "$FILES" ]; then
  echo "    (none)"
else
  echo "$FILES" | sed 's/^/    /'
fi
echo

# --- 4. fork-local leakage -------------------------------------------------
bold "4. Fork-local files in the diff"
leaked=""
for path in "${FORK_LOCAL[@]}"; do
  match=$(echo "$FILES" | grep -F "$path" || true)
  [ -n "$match" ] && leaked="${leaked}${match}"$'\n'
done
if [ -n "$leaked" ]; then
  red "  ✗ These are fork-local housekeeping and must not reach upstream:"
  echo "$leaked" | sed '/^$/d;s/^/      /'
  echo "    Remove them from this branch:"
  echo "$leaked" | sed '/^$/d' | sed 's|^|      git rm -r --cached |'
  echo "    ...then commit, or rebuild the branch from upstream/${UPSTREAM_BRANCH}."
  fail=1
else
  green "  ✓ Clean. No fork-local files in the diff."
fi
echo

# --- 5. CI gates -----------------------------------------------------------
if [ "$RUN_GATES" = "1" ]; then
  bold "5. CI gates"
  for gate in "npm run lint" "npm run typecheck" "npm test" "npm run build"; do
    printf '  %-20s' "$gate"
    if $gate >/tmp/preflight-gate.log 2>&1; then
      green "✓"
    else
      red "✗  (see /tmp/preflight-gate.log)"
      fail=1
    fi
  done
  echo
else
  echo "  (skipping CI gates; re-run with --gates to include them)"
  echo
fi

# --- verdict ---------------------------------------------------------------
if [ "$fail" = "0" ]; then
  green "READY. Compare link for Turtle.GTI:"
  echo "  https://github.com/DNiev/ecu-lab/compare/${UPSTREAM_BRANCH}...${FORK_SLUG}:${BRANCH}?expand=1"
  exit 0
else
  red "NOT READY. Fix the ✗ items above before handing this over."
  exit 1
fi
