#!/usr/bin/env bash
set -euo pipefail

CI_MODE=0
for arg in "$@"; do
  if [[ "$arg" == "--ci" ]]; then CI_MODE=1; fi
done

echo "🚀 [Template] Running Validation..."
if [[ $CI_MODE -eq 1 ]]; then
  DIRTY=$(git status --porcelain 2>/dev/null || echo "")
  if [[ -n "$DIRTY" ]]; then
    echo "❌ Working tree is dirty in CI mode!"
    exit 1
  fi
fi

# Chạy lệnh test của repo
if npm test; then
  echo "✅ Tests Passed!"
  exit 0
else
  echo "❌ Tests Failed!"
  exit 1
fi
