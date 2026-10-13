#!/usr/bin/env bash
set -euo pipefail
echo "🩺 [Template] Checking essential tools..."
command -v git >/dev/null 2>&1 || { echo "❌ Missing git"; exit 1; }
command -v node >/dev/null 2>&1 || { echo "❌ Missing node"; exit 1; }
echo "✅ Environment Healthy!"
exit 0
