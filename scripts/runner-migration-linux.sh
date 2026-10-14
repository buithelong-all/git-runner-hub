#!/usr/bin/env bash
# Reversible side-by-side cutover for a legacy shared-UID GitHub Actions runner.
# This script never deletes runner files, unregisters a runner, or changes ownership.
set -euo pipefail
umask 077

usage() {
  echo "Usage: runner-migration-linux.sh {plan|status|cutover|rollback} OWNER/REPO [--verified-runs N] [--root-prefix TEST_PATH]" >&2
  exit 2
}

[[ $# -ge 2 ]] || usage
ACTION="$1"
TARGET_REPO="$2"
shift 2
case "$ACTION" in plan|status|cutover|rollback) ;; *) echo "INVALID_ACTION" >&2; exit 2 ;; esac
if [[ ! "$TARGET_REPO" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$ ]] ||
   [[ "$TARGET_REPO" == *..* ]]; then echo "INVALID_REPOSITORY" >&2; exit 2; fi

VERIFIED_RUNS=0
ROOT_PREFIX=""
while [[ $# -gt 0 ]]; do
  case "$1" in
    --verified-runs) [[ $# -ge 2 && "$2" =~ ^[0-9]+$ ]] || usage; VERIFIED_RUNS="$2"; shift 2 ;;
    --root-prefix) [[ $# -ge 2 ]] || usage; ROOT_PREFIX="$2"; shift 2 ;;
    *) usage ;;
  esac
done

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
if [[ "$ACTION" == "plan" ]]; then
  exec bash "$SCRIPT_DIR/runner-setup-linux.sh" --plan-migration "$TARGET_REPO"
fi

if [[ -n "$ROOT_PREFIX" ]]; then
  [[ "${GITRUNNERHUB_TESTING:-}" == "1" && "$ROOT_PREFIX" == /tmp/* && -d "$ROOT_PREFIX" ]] || {
    echo "ROOT_PREFIX_FOR_TESTS_ONLY" >&2; exit 3;
  }
fi

SLUG="$(printf '%s' "$TARGET_REPO" | tr '/' '-' | tr -cd '[:alnum:]._-')"
DIGEST="$(printf '%s' "$TARGET_REPO" | tr '[:upper:]' '[:lower:]' | sha256sum | cut -c1-12)"
SERVICE_USER="ghr-$DIGEST"
LEGACY_DIR="$ROOT_PREFIX/opt/actions-runner-$SLUG"
RUNNER_DIR="$ROOT_PREFIX/opt/actions-runner-$SLUG-$DIGEST"
WORK_DIR="$ROOT_PREFIX/var/lib/gitrunnerhub/work-$SLUG-$DIGEST"
HOME_DIR="$ROOT_PREFIX/var/lib/gitrunnerhub/home-$SLUG-$DIGEST"

owner_of() { stat -c %U -- "$1"; }
mode_of() { stat -c %a -- "$1"; }
expected_owner() {
  if [[ -n "$ROOT_PREFIX" ]]; then id -un; else printf '%s\n' "$1"; fi
}
validate_dir() {
  local dir="$1" owner="$2" required_mode="${3:-}"
  [[ -d "$dir" && ! -L "$dir" ]] || { echo "UNSAFE_OR_MISSING_PATH: $dir" >&2; return 4; }
  [[ "$(owner_of "$dir")" == "$(expected_owner "$owner")" ]] || { echo "PATH_OWNER_MISMATCH: $dir" >&2; return 4; }
  if [[ -n "$required_mode" && "$(mode_of "$dir")" != "$required_mode" ]]; then
    echo "PATH_MODE_MISMATCH: $dir" >&2; return 4
  fi
}
is_running() { (cd "$1" && [[ -x ./svc.sh ]] && ./svc.sh status >/dev/null 2>&1); }
is_busy() {
  local dir="$1"
  if [[ -n "$ROOT_PREFIX" && -f "$dir/.runner-busy" ]]; then return 0; fi
  pgrep -f -- "$dir/bin/Runner.Worker" >/dev/null 2>&1
}
run_svc() { (cd "$1" && ./svc.sh "$2"); }

validate_dir "$LEGACY_DIR" actions-runner
validate_dir "$RUNNER_DIR" "$SERVICE_USER" 700
validate_dir "$WORK_DIR" "$SERVICE_USER" 700
validate_dir "$HOME_DIR" "$SERVICE_USER" 700

legacy_running=false
staged_running=false
is_running "$LEGACY_DIR" && legacy_running=true
is_running "$RUNNER_DIR" && staged_running=true

if [[ "$ACTION" == "status" ]]; then
  printf 'MIGRATION_STATUS legacy_running=%s staged_running=%s verified_runs=%s\n' "$legacy_running" "$staged_running" "$VERIFIED_RUNS"
  exit 0
fi

[[ "$EUID" -eq 0 || -n "$ROOT_PREFIX" ]] || { echo "REQUIRES_ROOT" >&2; exit 3; }
if [[ "$ACTION" == "cutover" ]]; then
  (( VERIFIED_RUNS >= 2 )) || { echo "TWO_VERIFIED_RUNS_REQUIRED" >&2; exit 6; }
  [[ "$staged_running" == true ]] || { echo "STAGED_RUNNER_NOT_RUNNING" >&2; exit 6; }
  if [[ "$legacy_running" == false ]]; then echo "CUTOVER_ALREADY_APPLIED"; exit 0; fi
  is_busy "$LEGACY_DIR" && { echo "LEGACY_RUNNER_BUSY" >&2; exit 6; }
  run_svc "$LEGACY_DIR" stop
  is_running "$LEGACY_DIR" && { echo "LEGACY_STOP_FAILED" >&2; exit 7; }
  echo "CUTOVER_APPLIED: legacy stopped; staged runner and all files preserved"
  exit 0
fi

if [[ "$legacy_running" == true && "$staged_running" == false ]]; then
  echo "ROLLBACK_ALREADY_APPLIED"
  exit 0
fi
is_busy "$RUNNER_DIR" && { echo "STAGED_RUNNER_BUSY" >&2; exit 6; }
if [[ "$staged_running" == true ]]; then run_svc "$RUNNER_DIR" stop; fi
if ! run_svc "$LEGACY_DIR" start; then
  run_svc "$RUNNER_DIR" start || true
  echo "ROLLBACK_LEGACY_START_FAILED: staged runner restart attempted" >&2
  exit 7
fi
echo "ROLLBACK_APPLIED: staged stopped; legacy started; no files removed"
