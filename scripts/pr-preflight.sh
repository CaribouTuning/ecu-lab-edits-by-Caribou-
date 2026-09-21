#!/usr/bin/env bash
#
# Fork-local. Gate for handing a branch to Turtle.GTI as a pull request against
# DNiev/ecu-lab. Exit 0 means: press Merge, nothing else needed.
#
#   git show main:scripts/pr-preflight.sh | bash                  # full gate (default)
#   git show main:scripts/pr-preflight.sh | bash -s -- --quick    # structure only, no CI gates
#
# Every check here exists because it failed on a real PR:
#   merge commits in the branch ....... #41, #90 (both needed Turtle to rebuild them)
#   stale base / conflicts ............ #41 ("Merge main into #41, and fix ...")
#   fork-local files in the diff ...... branches cut from this fork's main
#   fingerprint on one Node only ...... #41 (passed Node 20, failed Node 26, same commit)
#   tracked node_modules symlink ...... upstream PR #94 had to untrack it

set -uo pipefail

UPSTREAM_URL="https://github.com/DNiev/ecu-lab"
UPSTREAM_BRANCH="main"
FORK_SLUG="CaribouTuning:ecu-lab-edits-by-Caribou-"
CI_NODE_VERSIONS=(20 22)           # must match .github/workflows/ci.yml matrix.node

FORK_LOCAL=("CLAUDE.md" "docs/audit/" "scripts/pr-preflight.sh")
JUNK=("node_modules" ".DS_Store" ".env" "dist/" "*.log")

QUICK=0
[ "${1:-}" = "--quick" ] && QUICK=1

red()   { printf '\033[31m%s\033[0m\n' "$*"; }
green() { printf '\033[32m%s\033[0m\n' "$*"; }
yellow(){ printf '\033[33m%s\033[0m\n' "$*"; }
bold()  { printf '\033[1m%s\033[0m\n' "$*"; }

fail=0
warn=0

cd "$(git rev-parse --show-toplevel)" || exit 1
BRANCH=$(git rev-parse --abbrev-ref HEAD)

if [ "$BRANCH" = "main" ]; then
  red "✗ On main. Cut the PR branch from upstream/${UPSTREAM_BRANCH}:"
  echo "    git fetch upstream ${UPSTREAM_BRANCH} && git checkout -b <branch> upstream/${UPSTREAM_BRANCH}"
  exit 1
fi
if [ -n "$(git status --porcelain)" ]; then
  red "✗ Working tree is dirty. Commit or stash first."
  exit 1
fi

bold "Preflight: ${BRANCH}  →  DNiev/ecu-lab:${UPSTREAM_BRANCH}"
echo

git remote get-url upstream >/dev/null 2>&1 || git remote add upstream "$UPSTREAM_URL"
if ! git fetch --quiet upstream "$UPSTREAM_BRANCH" 2>/dev/null; then
  red "✗ Cannot reach ${UPSTREAM_URL}."; exit 1
fi
UP="upstream/${UPSTREAM_BRANCH}"

# ---------------------------------------------------------------- 1. fast-forward
bold "1. Can Turtle press Merge without resolving anything?"
if git merge-base --is-ancestor "$UP" HEAD; then
  green "   ✓ Fast-forward onto ${UP}. No conflict is possible."
else
  BEHIND=$(git rev-list --count "HEAD..${UP}")
  if MT=$(git merge-tree --write-tree "$UP" HEAD 2>&1); then
    yellow "   ! ${BEHIND} commit(s) behind ${UP}. It merges, but GitHub will show a merge commit."
    echo "     Make it a fast-forward:  git rebase ${UP}"
    warn=1
  else
    red "   ✗ CONFLICTS — Turtle would have to resolve these by hand:"
    echo "$MT" | grep '^CONFLICT' | sed 's/^/       /'
    echo "     Fix:  git rebase ${UP}"
    fail=1
  fi
fi
echo

# ---------------------------------------------------------------- 2. merge commits
bold "2. Merge commits inside the branch"
MERGES=$(git rev-list --merges "${UP}..HEAD")
if [ -n "$MERGES" ]; then
  red "   ✗ $(echo "$MERGES" | wc -l | tr -d ' ') merge commit(s) in this branch:"
  git log --oneline --merges "${UP}..HEAD" | sed 's/^/       /'
  echo "     Merging main INTO a PR branch is what forced Turtle to rebuild #41 and #90."
  echo "     Rebase instead:  git rebase ${UP}"
  fail=1
else
  green "   ✓ Linear. No merges of main into the branch."
fi
echo

# ---------------------------------------------------------------- 3. contents
bold "3. What the PR would contain"
COMMITS=$(git log --oneline "${UP}..HEAD")
if [ -z "$COMMITS" ]; then
  red "   ✗ No commits ahead of ${UP} — nothing to open."; fail=1
else
  echo "$COMMITS" | sed 's/^/       /'
fi
FILES=$(git diff --name-only "${UP}...HEAD")
echo "   Files:"
echo "${FILES:-       (none)}" | sed 's/^/       /'
echo

# ---------------------------------------------------------------- 4. stray files
bold "4. Files that must not reach upstream"
leaked=""
for p in "${FORK_LOCAL[@]}" "${JUNK[@]}"; do
  m=$(echo "$FILES" | grep -F "$p" || true)
  [ -n "$m" ] && leaked="${leaked}${m}"$'\n'
done
if [ -n "$leaked" ]; then
  red "   ✗ Remove these from the branch:"
  echo "$leaked" | sed '/^$/d' | sort -u | sed 's/^/       /'
  fail=1
else
  green "   ✓ Clean. No fork-local or junk files."
fi
echo

# ---------------------------------------------------------------- 5. fingerprint
bold "5. Fingerprint"
FP_TOUCHED=0
echo "$FILES" | grep -qE 'tests/fingerprint|src/sim/' && FP_TOUCHED=1
if [ "$FP_TOUCHED" = "1" ]; then
  yellow "   ! This branch touches src/sim/ or the fingerprint."
  echo "     CONTRIBUTING requires the PR body to state which numbers moved and why."
  echo "     Before/after report:  node scripts/update-fingerprint.js --report"
  echo "     The hash is float-sensitive and CI runs it on Node ${CI_NODE_VERSIONS[*]} —"
  echo "     it must pass on BOTH. (#41 passed one Node and failed another, same commit.)"
else
  green "   ✓ Branch does not touch the physics or the fingerprint."
fi
echo

# ---------------------------------------------------------------- 6. CI gates
if [ "$QUICK" = "1" ]; then
  yellow "6. CI gates skipped (--quick). Turtle's CI runs Node ${CI_NODE_VERSIONS[*]}."
  warn=1
  echo
else
  bold "6. CI gates on every Node version CI uses"
  if [ -s "${NVM_DIR:-$HOME/.nvm}/nvm.sh" ] || command -v nvm >/dev/null 2>&1; then
    for v in "${CI_NODE_VERSIONS[@]}"; do
      echo "   ── Node ${v} ──"
      if ! bash -lc "nvm use ${v}" >/dev/null 2>&1; then
        yellow "     ! Node ${v} not installed (nvm install ${v}). UNVERIFIED on this version."
        warn=1; continue
      fi
      for gate in "npm ci" "npm test" "npm run lint" "npm run typecheck" "npm run build"; do
        printf '     %-18s' "$gate"
        if bash -lc "nvm use ${v} >/dev/null 2>&1; cd '$PWD' && ${gate}" >"/tmp/preflight-n${v}.log" 2>&1; then
          green "✓"
        else
          red "✗   (/tmp/preflight-n${v}.log)"
          fail=1
        fi
      done
    done
  else
    yellow "   ! nvm not found — gates can only run on $(node --version)."
    echo "     CI runs Node ${CI_NODE_VERSIONS[*]}; a float-sensitive fingerprint can pass one and fail another."
    for gate in "npm test" "npm run lint" "npm run typecheck" "npm run build"; do
      printf '     %-18s' "$gate"
      if $gate >/tmp/preflight-gate.log 2>&1; then green "✓"; else red "✗   (/tmp/preflight-gate.log)"; fail=1; fi
    done
    warn=1
  fi
  echo
fi

# ---------------------------------------------------------------- verdict
if [ "$fail" != "0" ]; then
  red "NOT READY — Turtle would have to do work. Fix the ✗ items above."
  exit 1
elif [ "$warn" != "0" ]; then
  yellow "READY WITH CAVEATS — see the ! items. Compare link:"
  echo "  https://github.com/DNiev/ecu-lab/compare/${UPSTREAM_BRANCH}...${FORK_SLUG}:${BRANCH}?expand=1"
  exit 0
else
  green "READY. Fast-forward, linear, clean, green on Node ${CI_NODE_VERSIONS[*]}."
  green "Turtle presses Merge and that is it:"
  echo "  https://github.com/DNiev/ecu-lab/compare/${UPSTREAM_BRANCH}...${FORK_SLUG}:${BRANCH}?expand=1"
  exit 0
fi
