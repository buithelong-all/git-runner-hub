#!/usr/bin/env bash
# GitRunnerHub Linux/WSL2 P0: provision a NEW runner with its own OS account.
# Read-only: bash scripts/runner-setup-linux.sh --plan OWNER/REPO
# Token via stdin only: gh api ... | sudo bash scripts/runner-setup-linux.sh OWNER/REPO -
# Existing runner installations are never overwritten.
set -euo pipefail
umask 077
usage() { echo "Usage: runner-setup-linux.sh [--plan|--plan-migration|--stage-migration] OWNER/REPO [-]" >&2; exit 2; }
MODE=provision
case "${1:-}" in
  --plan) MODE=plan; shift ;;
  --plan-migration) MODE=plan-migration; shift ;;
  --stage-migration) MODE=stage-migration; shift ;;
esac
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
DEFAULT_LABELS=true
LEGACY_PRESERVED=false
if [[ "$MODE" == "plan-migration" || "$MODE" == "stage-migration" ]]; then
  RUNNER_NAME="local-$SLUG-isolated-$DIGEST"
  LABEL_NAME="grh-$DIGEST"
  DEFAULT_LABELS=false
  LEGACY_PRESERVED=true
fi
VERSION="2.338.0"
CHECKSUM_X64="af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32"
if [[ "$MODE" == "plan" || "$MODE" == "plan-migration" ]]; then
  PLAN_MODE="new-install"
  [[ "$MODE" == "plan-migration" ]] && PLAN_MODE="migration-stage"
  printf '{"repository":"%s","mode":"%s","service_user":"%s","runner_dir":"%s","work_dir":"%s","home_dir":"%s","runner_name":"%s","runner_label":"%s","default_labels":%s,"path_mode":"0700","legacy_runner_dir":"%s","legacy_overwrite":false,"legacy_preserved":%s}\n' \
    "$TARGET_REPO" "$PLAN_MODE" "$SERVICE_USER" "$RUNNER_DIR" "$WORK_DIR" "$HOME_DIR" "$RUNNER_NAME" "$LABEL_NAME" "$DEFAULT_LABELS" "$LEGACY_RUNNER_DIR" "$LEGACY_PRESERVED"
  exit 0
fi
[[ "$EUID" -eq 0 ]] || { echo "REQUIRES_ROOT_FOR_NEW_INSTALL" >&2; exit 3; }
# Fail closed before mutation: legacy and existing installs require a separate
# host-verified migration, never a silent chown or service replacement.
if [[ "$MODE" == "provision" && ( -e "$LEGACY_RUNNER_DIR" || -L "$LEGACY_RUNNER_DIR" ) ]]; then
  echo "EXISTING_RUNNER_DETECTED: inspect the host and migrate explicitly; no overwrite" >&2; exit 4
fi
if [[ "$MODE" == "stage-migration" && ( ! -d "$LEGACY_RUNNER_DIR" || -L "$LEGACY_RUNNER_DIR" ) ]]; then
  echo "LEGACY_RUNNER_NOT_FOUND_OR_SYMLINK: staging requires the preserved legacy installation" >&2; exit 4
fi
if [[ -e "$RUNNER_DIR" || -L "$RUNNER_DIR" || -e "$WORK_DIR" || -L "$WORK_DIR" || -e "$HOME_DIR" || -L "$HOME_DIR" ]]; then
  if [[ "$MODE" == "stage-migration" && -d "$RUNNER_DIR" && ! -L "$RUNNER_DIR" &&
        -d "$WORK_DIR" && ! -L "$WORK_DIR" && -d "$HOME_DIR" && ! -L "$HOME_DIR" &&
        -f "$RUNNER_DIR/.runner" && -f "$RUNNER_DIR/.service" && -x "$RUNNER_DIR/svc.sh" ]] &&
       id "$SERVICE_USER" >/dev/null 2>&1 &&
       [[ "$(stat -c '%U:%a' "$RUNNER_DIR")" == "$SERVICE_USER:700" ]] &&
       [[ "$(stat -c '%U:%a' "$WORK_DIR")" == "$SERVICE_USER:700" ]] &&
       [[ "$(stat -c '%U:%a' "$HOME_DIR")" == "$SERVICE_USER:700" ]] &&
       (cd "$RUNNER_DIR" && ./svc.sh status >/dev/null 2>&1); then
    echo "MIGRATION_ALREADY_STAGED: verified existing dedicated paths; no mutation"
    exit 0
  fi
  echo "PARTIAL_OR_EXISTING_STAGED_STATE: refusing overwrite" >&2; exit 4
fi
if id "$SERVICE_USER" >/dev/null 2>&1; then
  echo "SERVICE_IDENTITY_EXISTS: inspect before reusing an existing UID" >&2; exit 4
fi
[[ $# -eq 2 && "$2" == "-" ]] || { echo "TOKEN_MUST_BE_STDIN; never put a registration token in command arguments" >&2; exit 3; }
IFS= read -r REG_TOKEN || { echo "MISSING_REGISTRATION_TOKEN" >&2; exit 3; }
[[ "$REG_TOKEN" =~ ^[A-Za-z0-9_-]{15,200}$ ]] || { echo "INVALID_REGISTRATION_TOKEN" >&2; exit 3; }
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
  if [[ "$MODE" == "stage-migration" ]]; then
    runuser -u "$SERVICE_USER" -- env HOME="$HOME_DIR" ./config.sh \
      --url "https://github.com/$TARGET_REPO" --token "$REG_TOKEN" \
      --name "$RUNNER_NAME" --labels "$LABEL_NAME" --no-default-labels \
      --work "$WORK_DIR" --unattended
  else
    runuser -u "$SERVICE_USER" -- env HOME="$HOME_DIR" ./config.sh \
      --url "https://github.com/$TARGET_REPO" --token "$REG_TOKEN" \
      --name "$RUNNER_NAME" --labels "self-hosted,Linux,X64,$LABEL_NAME" \
      --work "$WORK_DIR" --unattended
  fi
  ./svc.sh install "$SERVICE_USER"
  ./svc.sh start
)
echo "RUNNER_INSTALLED: $RUNNER_NAME, dedicated unprivileged account $SERVICE_USER"
[[ "$MODE" == "stage-migration" ]] && echo "MIGRATION_STAGED: legacy runner preserved; route only explicit label $LABEL_NAME"
echo "NEXT: verify online status AND a real workflow run at an exact SHA"
