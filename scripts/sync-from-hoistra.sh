#!/bin/sh
# Refresh this repository's copy of Trace Lab from a Hoistra checkout.
#
#   scripts/sync-from-hoistra.sh /path/to/Hoistra_Plenum
#
# Copies, overwriting what is here:
#   apps/backend/cafm-connector-service-final/svc-trace-lab        -> backend/   (its own Dockerfile is not taken)
#   apps/backend/cafm-connector-service-final/svc-deepagents/src,  -> vendor/svc-deepagents/
#     skills and pyproject.toml
#   the frontend files listed in scripts/frontend-files.txt         -> frontend/
# and records the Hoistra branch and commit in vendor/svc-deepagents/VENDORED.md. It never deletes a file here that
# Hoistra no longer has: check `git status` afterwards, then run the tests (README.md, "Tests").
set -eu

HOISTRA="${1:?usage: scripts/sync-from-hoistra.sh /path/to/Hoistra_Plenum}"
HERE="$(cd "$(dirname "$0")/.." && pwd)"
BACK="$HOISTRA/apps/backend/cafm-connector-service-final"
FRONT="$HOISTRA/apps/frontend"

[ -d "$BACK/svc-trace-lab/trace_lab" ] || { echo "not a Hoistra checkout: $HOISTRA" >&2; exit 1; }

rsync -a --exclude __pycache__ --exclude .pytest_cache --exclude Dockerfile --exclude Dockerfile.dockerignore \
    --exclude 'ops/g0_audit*' "$BACK/svc-trace-lab/" "$HERE/backend/"
rsync -a --exclude __pycache__ "$BACK/svc-deepagents/src" "$BACK/svc-deepagents/skills" \
    "$BACK/svc-deepagents/pyproject.toml" "$HERE/vendor/svc-deepagents/"
rsync -a --files-from="$HERE/scripts/frontend-files.txt" "$FRONT/" "$HERE/frontend/"

BRANCH="$(git -C "$HOISTRA" rev-parse --abbrev-ref HEAD 2>/dev/null || echo unknown)"
COMMIT="$(git -C "$HOISTRA" rev-parse --short HEAD 2>/dev/null || echo unknown)"
DIRTY="$(git -C "$HOISTRA" status --porcelain -- apps/backend/cafm-connector-service-final/svc-deepagents 2>/dev/null | wc -l | tr -d ' ')"
sed -i.bak "s/^Taken from: .*/Taken from: Hoistra branch \`$BRANCH\`, commit \`$COMMIT\` ($DIRTY uncommitted svc-deepagents files), on $(date +%Y-%m-%d)./" \
    "$HERE/vendor/svc-deepagents/VENDORED.md" && rm -f "$HERE/vendor/svc-deepagents/VENDORED.md.bak"

echo "synced from $HOISTRA ($BRANCH @ $COMMIT). Next: git status, then the tests."
