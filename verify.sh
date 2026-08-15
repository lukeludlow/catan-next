#!/usr/bin/env bash
# The gate — run before every commit (docs/ROADMAP.md §8, Phase 1.5).
# One stage per line, fail-fast, so .github/workflows/ci.yml can stay a thin
# wrapper that calls this script rather than a second list of steps that drifts.
#
# Usage: ./verify.sh   (no arguments)
# The reference's --dist and --db flags have no analogue here: there is no
# Supabase tier, and `next build` is cheap enough to run unconditionally.
set -u
cd "$(dirname "$0")"

if [ "$#" -gt 0 ]; then
    echo "verify.sh takes no arguments (got: $*)"
    exit 2
fi

stage() {
    local name="$1"
    shift
    echo "── ${name}"
    if "$@"; then
        echo "✔ PASS  ${name}"
    else
        echo "✘ FAIL  ${name}"
        exit 1
    fi
}

stage "lint" npx eslint .
stage "format" npx prettier --check .
# --noEmit rather than the reference's `tsc -b`: one tsconfig, no project
# references, and it matches the `typecheck` script in package.json.
stage "typecheck" npx tsc --noEmit
stage "unit tests" npx vitest run --project unit
stage "browser tests" npx vitest run --project browser
stage "build" npm run build

echo "All stages passed."
