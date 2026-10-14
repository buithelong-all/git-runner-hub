#!/usr/bin/env bash
# GitRunnerHub Linux/WSL2 P0: provision a NEW runner with its own OS account.
# Read-only: bash scripts/runner-setup-linux.sh --plan OWNER/REPO
# Token via stdin only: gh api ... | sudo bash scripts/runner-setup-linux.sh OWNER/REPO -
# Existing runner installations are never overwritten.
set -euo pipefail
umask 077
usage() { echo "Usage: runner-setup-linux.sh [--plan] OWNER/REPO [-]" >&2; exit 2; }
MODE=provision
if [[ $# -gt 0 && "$1" == "--plan" ]]; then MODE=plan; shift; fi
[[ $# -ge 1 && $# -le 2 ]] || usage
TARGET_REPO="$1"
# Shell metacharacters, whitespace, parent traversal and extra slashes are forbidden.
if [[ ! "$TARGET_REPO" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] ||
   [[ "$TARGET_REPO" == *..* ]]; then
  echo "INVALID_REPOSITORY" >&2; exit 2
fi
SLUG="$(printf '%s' "$TARGET_REPO" | tr '/' '-' | tr -cd '[:alnum:]._-')"
DIGEST="$(printf '%s' "$TARGET_REPO" | tr '[:upper:]' '[:lower:]' | sha256sum | cut -c1-12)"
SERVICE_USER="ghr-$DIGEST"
LEGACY_RUNNER_DIR="/opt/actions-runner-$SLUG"
RUNNER_DIR="/opt/actions-runner-$SLUG-$DIGEST"
WORK_DIR="/var/lib/gitrunnerhub/work-$SLUG-$DIGEST"
HOME_DIR="/var/lib/gitrunnerhub/home-$SLUG-$DIGEST"
RUNNER_NAME="local-$SLUG"
LABEL_NAME="$SLUG-local"
VERSION="2.338.0"
CHECKSUM_X64="7ea4d6350325d975a507851d7fe31d17d59850cfdf15bfbc1309d43d1a8e104d"
if [[ "$MODE" == "plan" ]]; then
  printf '{"repository":"%s","service_user":"%s","runner_dir":"%s","work_dir":"%s","home_dir":"%s","runner_name":"%s","legacy_overwrite":false}\n' \
    "$TARGET_REPO" "$SERVICE_USER" "$RUNNER_DIR" "$WORK_DIR" "$HOME_DIR" "$RUNNER_NAME"
  exit 0
fi
[[ "$EUID" -eq 0 ]] || { echo "REQUIRES_ROOT_FOR_NEW_INSTALL" >&2; exit 3; }
[[ $# -eq 2 && "$2" == "-" ]] || { echo "TOKEN_MUST_BE_STDIN; never put a registration token in command arguments" >&2; exit 3; }
IFS= read -r REG_TOKEN || { echo "MISSING_REGISTRATION_TOKEN" >&2; exit 3; }
[[ "$REG_TOKEN" =~ ^[A-Za-z0-9_-]{15,200}$ ]] || { echo "INVALID_REGISTRATION_TOKEN" >&2; exit 3; }
# Fail closed before mutation: legacy and existing installs require a separate
# host-verified migration, never a silent chown or service replacement.
if [[ -e "$LEGACY_RUNNER_DIR" || -L "$LEGACY_RUNNER_DIR" ||
      -e "$RUNNER_DIR" || -L "$RUNNER_DIR" || -e "$WORK_DIR" || -L "$WORK_DIR" ]]; then
  echo "EXISTING_RUNNER_DETECTED: inspect the host and migrate explicitly; no overwrite" >&2; exit 4
fi
if id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "SERVICE_IDENTITY_EXISTS: inspect before reusing an existing UID" >&2; exit 4
fi
for cmd in sha256sum runuser curl useradd install tar; do
  command -v "$cmd" >/dev/null || { echo "MISSING_TOOL: $cmd" >&2; exit 5; }
done
[[ "$(uname -m)" == "x86_64" ]] || { echo "UNSUPPORTED_ARCHITECTURE: Linux x64 required" >&2; exit 5; }
ARCHIVE="$(mktemp /tmp/ghr-runner.XXXXXXXX.tar.gz)"
trap 'rm -f "$ARCHIVE"; unset REG_TOKEN' EXIT
curl -fsSL --retry 2 \
  "https://github.com/actions/runner/releases/download/v$VERSION/actions-runner-linux-x64-$VERSION.tar.gz" \
  -o "$ARCHIVE"
printf '%s  %s\n' "$CHECKSUM_X64" "$ARCHIVE" | sha256sum --check --status || {
  echo "RUNNER_CHECKSUM_MISMATCH" >&2; exit 5
}
# Parent must remain traversable (0755); each per-repo home/work dir is 0700.
install -d -m 0755 /var/lib/gitrunnerhub
useradd --system --user-group --create-home --home-dir "$HOME_DIR" --shell /usr/sbin/nologin "$SERVICE_USER"
install -d -o "$SERVICE_USER" -g "$SERVICE_USER" -m 0700 "$HOME_DIR" "$WORK_DIR" "$RUNNER_DIR"
tar -xzf "$ARCHIVE" -C "$RUNNER_DIR"
chown -R "$SERVICE_USER:$SERVICE_USER" "$RUNNER_DIR"
chmod 0700 "$RUNNER_DIR" "$WORK_DIR" "$HOME_DIR"
# No --replace: never supersede another runner registration implicitly.
(
  cd "$RUNNER_DIR"
  runuser -u "$SERVICE_USER" -- env HOME="$HOME_DIR" ./config.sh \
    --url "https://github.com/$TARGET_REPO" --token "$REG_TOKEN" \
    --name "$RUNNER_NAME" --labels "self-hosted,Linux,X64,$LABEL_NAME" \
    --work "$WORK_DIR" --unattended
  ./svc.sh install "$SERVICE_USER"
  ./svc.sh start
)
echo "RUNNER_INSTALLED: $RUNNER_NAME, dedicated unprivileged account $SERVICE_USER"
echo "NEXT: verify online status AND a real workflow run at an exact SHA"
