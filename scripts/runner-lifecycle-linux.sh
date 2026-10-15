#!/usr/bin/env bash
# GitRunnerHub Linux lifecycle for both legacy and per-repo service users.
# Destructive detach requires a dedicated identity and remove token via stdin.
set -euo pipefail
umask 077
[[ $# -ge 2 ]] || { echo "USAGE: lifecycle ACTION OWNER/REPO" >&2; exit 2; }
ACTION="$1"
TARGET_REPO="$2"
if [[ ! "$TARGET_REPO" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] ||
   [[ "$TARGET_REPO" == *..* ]]; then echo "INVALID_REPOSITORY" >&2; exit 2; fi
case "$ACTION" in status|start|stop|restart|detach) ;; *) echo "INVALID_ACTION" >&2; exit 2;; esac
SLUG="$(printf '%s' "$TARGET_REPO" | tr '/' '-' | tr -cd '[:alnum:]._-')"
DIGEST="$(printf '%s' "$TARGET_REPO" | tr '[:upper:]' '[:lower:]' | sha256sum | cut -c1-12)"
SERVICE_USER="ghr-$DIGEST"
RUNNER_DIR="/opt/actions-runner-$SLUG-$DIGEST"
WORK_DIR="/var/lib/gitrunnerhub/work-$SLUG-$DIGEST"
LEGACY_DIR="/opt/actions-runner-$SLUG"
if [[ ! -e "$RUNNER_DIR" && ! -L "$RUNNER_DIR" && -d "$LEGACY_DIR" ]]; then
  RUNNER_DIR="$LEGACY_DIR"
fi
[[ "$EUID" -eq 0 ]] || { echo "REQUIRES_ROOT" >&2; exit 3; }
[[ -d "$RUNNER_DIR" && ! -L "$RUNNER_DIR" ]] || {
  echo "RUNNER_NOT_FOUND_OR_SYMLINK" >&2; exit 4
}
ACTUAL_OWNER="$(stat -c %U "$RUNNER_DIR")"
if [[ "$ACTUAL_OWNER" != "$SERVICE_USER" && "$ACTUAL_OWNER" != "actions-runner" ]]; then
  echo "UNKNOWN_RUNNER_OWNER: refusing operations" >&2; exit 4
fi
cd "$RUNNER_DIR"
case "$ACTION" in
  status) ./svc.sh status ;;
  start) ./svc.sh start ;;
  stop) ./svc.sh stop ;;
  restart) ./svc.sh stop; ./svc.sh start ;;
  detach)
    if [[ "$ACTUAL_OWNER" != "$SERVICE_USER" || "$RUNNER_DIR" == "$LEGACY_DIR" ]]; then
      echo "LEGACY_SHARED_UID: no automatic detach; supervised migration required" >&2; exit 4
    fi
    [[ $# -eq 3 && "$3" == "-" ]] || { echo "REMOVE_TOKEN_MUST_BE_STDIN" >&2; exit 3; }
    IFS= read -r REMOVE_TOKEN || { echo "MISSING_REMOVE_TOKEN" >&2; exit 3; }
    [[ "$REMOVE_TOKEN" =~ ^[A-Za-z0-9_-]{15,200}$ ]] || { echo "INVALID_REMOVE_TOKEN" >&2; exit 3; }
    [[ -d "$WORK_DIR" && ! -L "$WORK_DIR" ]] || {
      echo "WORKSPACE_NOT_FOUND_OR_SYMLINK" >&2; exit 4
    }
    [[ "$(stat -c %U "$WORK_DIR")" == "$SERVICE_USER" ]] || {
      echo "WORKSPACE_OWNER_MISMATCH" >&2; exit 4
    }
    ./svc.sh stop
    ./svc.sh uninstall
    # Never erase directory state when GitHub unregister fails.
    runuser -u "$SERVICE_USER" -- ./config.sh remove --token "$REMOVE_TOKEN"
    unset REMOVE_TOKEN
    cd /
    rm -rf -- "$RUNNER_DIR" "$WORK_DIR"
    echo "DETACHED: service and workspace removed; account/home retained for inspection"
    ;;
esac
