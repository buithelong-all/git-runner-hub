#!/usr/bin/env bash
# ==============================================================================
# GitRunnerHub - macOS Runner Provisioner (Apple Silicon ARM64 & Intel x64)
# Usage: bash runner-setup-mac.sh <owner/repo>
# ==============================================================================

set -euo pipefail

TARGET_REPO="${1:-}"

if [[ -z "$TARGET_REPO" ]]; then
  echo "❌ Lỗi: Cần truyền tên repository (ví dụ: buithelong-all/caevietnam.vn)"
  exit 1
fi

ARCH=$(uname -m)
if [[ "$ARCH" == "arm64" ]]; then
  RUNNER_ARCH="osx-arm64"
else
  RUNNER_ARCH="osx-x64"
fi

REPO_SLUG=$(echo "$TARGET_REPO" | tr '/' '-' | tr -cd '[:alnum:]-_')
RUNNER_DIR="$HOME/actions-runner-${REPO_SLUG}"
LABEL_NAME="${REPO_SLUG}-local"
RUNNER_NAME="mac-${REPO_SLUG}"

echo "🍎 [GitRunnerHub] Đang thiết lập macOS Runner ($RUNNER_ARCH) cho: $TARGET_REPO..."

# 1. Lấy registration token qua gh CLI
REG_TOKEN=$(gh api --method POST "repos/${TARGET_REPO}/actions/runners/registration-token" --jq .token 2>/dev/null || true)
if [[ -z "$REG_TOKEN" || "$REG_TOKEN" == "null" ]]; then
  echo "❌ Lỗi: Không thể lấy token đăng ký từ GitHub. Hãy kiểm tra 'gh auth status'!"
  exit 1
fi

# 2. Chuẩn bị thư mục và tải gói runner chính thức cho macOS
mkdir -p "$RUNNER_DIR"
cd "$RUNNER_DIR"

RUNNER_TAR="/tmp/actions-runner-${RUNNER_ARCH}-2.338.0.tar.gz"
if [[ ! -f "$RUNNER_TAR" ]]; then
  echo "⬇️ Đang tải GitHub Actions Runner cho macOS ($RUNNER_ARCH)..."
  curl -o "$RUNNER_TAR" -L "https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-${RUNNER_ARCH}-2.338.0.tar.gz"
fi
tar -xzf "$RUNNER_TAR"

# 3. Đăng ký runner
./config.sh --url "https://github.com/${TARGET_REPO}" \
            --token "$REG_TOKEN" \
            --name "$RUNNER_NAME" \
            --labels "self-hosted,macOS,$ARCH,$LABEL_NAME" \
            --unattended \
            --replace

# 4. Cài đặt và bật launchd service cho macOS
./svc.sh install
./svc.sh start

echo "✅ [GitRunnerHub] ĐÃ HOÀN TẤT! macOS Runner cho $TARGET_REPO đã ONLINE."
