#!/usr/bin/env bash
# ==============================================================================
# GitRunnerHub - Validation Execution Suite [GRH-103, GRH-160, GRH-161]
# ==============================================================================

set -euo pipefail

CI_MODE=0
for arg in "$@"; do
  if [[ "$arg" == "--ci" ]]; then
    CI_MODE=1
  fi
done

LOCK_FILE="/tmp/git_runner_hub_ci.lock"
LOG_DIR=".ci-logs"
mkdir -p "$LOG_DIR"
RUN_ID=$(date +%Y%m%d_%H%M%S)
LOG_FILE="${LOG_DIR}/validate_${RUN_ID}.log"

echo "=========================================================="
echo "🚀 [GitRunnerHub] Validation Suite"
echo "🕒 Thời gian: $(date '+%Y-%m-%d %H:%M:%S GMT+7')"
echo "📄 Log file: $LOG_FILE"
echo "=========================================================="

# 1. Bounded Concurrency qua Linux kernel flock nếu có
if command -v flock &>/dev/null; then
  exec 200>"$LOCK_FILE"
  chmod 666 "$LOCK_FILE" 2>/dev/null || true
  if ! flock -n 200; then
    echo "⚠️ Có tiến trình CI khác đang chạy. Đang chờ mở khóa..."
    flock -w 600 200 || { echo "❌ Lỗi: Timeout chờ giải phóng lock!"; exit 1; }
  fi
fi

# 2. Thu thập thông tin phiên bản & Git state
CURRENT_SHA=$(git rev-parse HEAD 2>/dev/null || echo "UNKNOWN")
DIRTY_STATE=$(git status --porcelain 2>/dev/null || echo "")

if [[ $CI_MODE -eq 1 && -n "$DIRTY_STATE" ]]; then
  echo "❌ Lỗi CI Mode: Working tree có thay đổi chưa commit!"
  git status --short
  exit 1
fi

echo "📌 Commit SHA: $CURRENT_SHA"
echo "🛠️  Node: $(node -v 2>/dev/null || echo 'none')"

# 3. Thực thi kiểm thử
echo "🧪 Đang chạy Unit Tests..."
if node --test test/*.test.js 2>&1 | tee "$LOG_FILE"; then
  echo "=========================================================="
  echo "✅ VALIDATION PASSED (100% Tests Green)"
  echo "=========================================================="
  exit 0
else
  echo "=========================================================="
  echo "❌ VALIDATION FAILED"
  echo "=========================================================="
  exit 1
fi
