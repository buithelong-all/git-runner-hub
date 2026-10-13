#!/usr/bin/env bash
# ==============================================================================
# GitRunnerHub - Linux & WSL2 Runner Lifecycle Manager [GRH-128, GRH-129]
# Usage: sudo bash runner-lifecycle-linux.sh <action> <owner/repo> [remove_token]
# Actions: status | start | stop | restart | detach
# ==============================================================================

set -euo pipefail

ACTION="${1:-status}"
TARGET_REPO="${2:-}"
REMOVE_TOKEN="${3:-}"

if [[ -z "$TARGET_REPO" ]]; then
  echo "❌ Lỗi: Cần truyền tên repository (ví dụ: buithelong-all/caevietnam.vn)"
  exit 1
fi

REPO_SLUG=$(echo "$TARGET_REPO" | tr '/' '-' | tr -cd '[:alnum:]-_')
RUNNER_DIR="/opt/actions-runner-${REPO_SLUG}"

if [[ ! -d "$RUNNER_DIR" ]]; then
  echo "⚠️ Runner cho $TARGET_REPO chưa được cài đặt (thư mục $RUNNER_DIR không tồn tại)."
  exit 2
fi

cd "$RUNNER_DIR"

case "$ACTION" in
  status)
    echo "📊 Trạng thái dịch vụ runner cho $TARGET_REPO:"
    ./svc.sh status || true
    ;;
  start)
    echo "▶️ Đang khởi động runner service..."
    ./svc.sh start
    ;;
  stop)
    echo "⏹️ Đang dừng runner service..."
    ./svc.sh stop
    ;;
  restart)
    echo "🔄 Đang khởi động lại runner service..."
    ./svc.sh stop 2>/dev/null || true
    ./svc.sh start
    ;;
  detach)
    echo "🗑️ Đang gỡ bỏ (detach) runner cho $TARGET_REPO..."
    ./svc.sh stop 2>/dev/null || true
    ./svc.sh uninstall 2>/dev/null || true
    
    if [[ -n "$REMOVE_TOKEN" && "$REMOVE_TOKEN" != "null" ]]; then
      echo "🔑 Đang hủy đăng ký với GitHub..."
      su - actions-runner -c "cd '$RUNNER_DIR' && ./config.sh remove --token '$REMOVE_TOKEN'" || true
    fi

    echo "🧹 Dọn dẹp thư mục làm việc..."
    rm -rf "$RUNNER_DIR"
    rm -rf "/home/actions-runner/work-${REPO_SLUG}"
    echo "✅ ĐÃ GỠ BỎ HOÀN TẤT runner cho $TARGET_REPO."
    ;;
  *)
    echo "❌ Lỗi: Hành động không hợp lệ: $ACTION (Hỗ trợ: status, start, stop, restart, detach)"
    exit 1
    ;;
esac
