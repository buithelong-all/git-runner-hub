#!/usr/bin/env bash
# ==============================================================================
# GitRunnerHub - Linux & WSL2 Runner Provisioner
# Usage: sudo bash runner-setup-linux.sh <owner/repo>
# ==============================================================================

set -euo pipefail

TARGET_REPO="${1:-}"

if [[ -z "$TARGET_REPO" ]]; then
  echo "❌ Lỗi: Cần truyền tên repository (ví dụ: buithelong-all/caevietnam.vn)"
  exit 1
fi

REPO_SLUG=$(echo "$TARGET_REPO" | tr '/' '-' | tr -cd '[:alnum:]-_')
RUNNER_DIR="/opt/actions-runner-${REPO_SLUG}"
WORK_DIR="/home/actions-runner/work-${REPO_SLUG}"
LABEL_NAME="${REPO_SLUG}-local"
RUNNER_NAME="local-${REPO_SLUG}"

echo "🚀 [GitRunnerHub] Đang thiết lập Runner cho: $TARGET_REPO..."

# 1. Đảm bảo user actions-runner tồn tại
if ! id "actions-runner" &>/dev/null; then
  useradd -m -s /bin/bash actions-runner
fi

# 2. Lấy registration token qua gh CLI
REG_TOKEN=$(gh api --method POST "repos/${TARGET_REPO}/actions/runners/registration-token" --jq .token 2>/dev/null || true)
if [[ -z "$REG_TOKEN" || "$REG_TOKEN" == "null" ]]; then
  echo "❌ Lỗi: Không thể lấy token đăng ký từ GitHub. Hãy kiểm tra 'gh auth status'!"
  exit 1
fi

# 3. Chuẩn bị thư mục
mkdir -p "$RUNNER_DIR" "$WORK_DIR"
chown -R actions-runner:actions-runner "$RUNNER_DIR" "$WORK_DIR"

RUNNER_TAR="/tmp/actions-runner-linux-x64-2.338.0.tar.gz"
if [[ ! -f "$RUNNER_TAR" ]]; then
  curl -o "$RUNNER_TAR" -L https://github.com/actions/runner/releases/download/v2.338.0/actions-runner-linux-x64-2.338.0.tar.gz
fi
tar -xzf "$RUNNER_TAR" -C "$RUNNER_DIR"
chown -R actions-runner:actions-runner "$RUNNER_DIR"

# Patch HTTP/1.1 cho WSL2 ổn định kết nối
RUNTIME_CONFIG="$RUNNER_DIR/bin/Runner.Listener.runtimeconfig.json"
if [[ -f "$RUNTIME_CONFIG" ]]; then
  su - actions-runner -c "node -e '
    const fs = require(\"fs\");
    const p = \"$RUNTIME_CONFIG\";
    const d = JSON.parse(fs.readFileSync(p, \"utf8\"));
    d.configProperties = d.configProperties || {};
    d.configProperties[\"System.Net.Http.SocketsHttpHandler.Http2Support\"] = false;
    fs.writeFileSync(p, JSON.stringify(d, null, 2));
  '" || true
fi

# 4. Đăng ký runner
su - actions-runner -c "
  cd '$RUNNER_DIR'
  ./config.sh --url 'https://github.com/${TARGET_REPO}' \
              --token '$REG_TOKEN' \
              --name '$RUNNER_NAME' \
              --labels 'self-hosted,Linux,X64,$LABEL_NAME' \
              --work '$WORK_DIR' \
              --unattended \
              --replace
"

# 5. Cài đặt và bật service
cd "$RUNNER_DIR"
./svc.sh install actions-runner
./svc.sh start

echo "✅ [GitRunnerHub] ĐÃ HOÀN TẤT! Runner cho $TARGET_REPO đã ONLINE."
