#!/usr/bin/env bash
# ==============================================================================
# GitRunnerHub - Doctor Verification Contract [GRH-103, GRH-006]
# ==============================================================================

set -euo pipefail

echo "=========================================================="
echo "🩺 [GitRunnerHub] Doctor Environment Check"
echo "=========================================================="

FAILED=0

check_cmd() {
  local name="$1"
  local cmd="$2"
  if command -v "$cmd" &>/dev/null; then
    echo "  ✅ $name: Sẵn sàng ($(command -v "$cmd"))"
  else
    echo "  ❌ $name: KHÔNG TÌM THẤY '$cmd'"
    FAILED=1
  fi
}

echo "1. Kiểm tra Công cụ thiết yếu:"
check_cmd "Git" "git"
check_cmd "Node.js" "node"

NODE_VER=$(node -v 2>/dev/null || echo "none")
echo "  ℹ️  Node Version: $NODE_VER"

echo "2. Kiểm tra GitHub CLI:"
if command -v gh &>/dev/null; then
  echo "  ✅ GitHub CLI: Đã cài đặt"
  if gh auth status &>/dev/null; then
    echo "  ✅ GitHub Auth: Đã xác thực tài khoản"
  else
    echo "  ⚠️  GitHub Auth: Chưa đăng nhập ('gh auth login')"
  fi
else
  echo "  ⚠️  GitHub CLI: Không tìm thấy trong PATH này"
fi

echo "3. Kiểm tra Tệp cấu trúc Repository:"
FILES=("package.json" "src/main/main.js" "src/core/result.js" "src/core/repo.js" "src/core/security.js")
for f in "${FILES[@]}"; do
  if [[ -f "$f" ]]; then
    echo "  ✅ File tồn tại: $f"
  else
    echo "  ❌ File thiếu: $f"
    FAILED=1
  fi
done

echo "=========================================================="
if [[ $FAILED -eq 0 ]]; then
  echo "🎉 Doctor Status: HEALTHY (Mọi điều kiện hợp lệ)"
  exit 0
else
  echo "⚠️ Doctor Status: UNHEALTHY (Phát hiện lỗi ở trên)"
  exit 1
fi
