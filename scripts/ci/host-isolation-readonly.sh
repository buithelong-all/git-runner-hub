#!/usr/bin/env bash
# Read-only and secret-safe host isolation observation for an authorized CI runner.
# Does not print paths, environment variables, process args, credentials or tokens.
# Findings describe THIS runner host, never assume all of the user's machines.
set -euo pipefail
self_uid="$(id -u)"
self_user="$(id -un)"
shared_count=0
directories_seen=0
unknown_count=0
shopt -s nullglob
for dir in /opt/actions-runner-*; do
  [[ -d "$dir" && ! -L "$dir" ]] || continue
  directories_seen=$((directories_seen+1))
  owner="$(stat -c '%u' -- "$dir" 2>/dev/null || true)"
  if [[ ! "$owner" =~ ^[0-9]+$ ]]; then
    unknown_count=$((unknown_count+1))
    continue
  fi
  if [[ "$owner" == "$self_uid" ]]; then
    shared_count=$((shared_count+1))
  fi
done
root=false
legacy_user=false
distinct_uid_status="UNVERIFIED"
if [[ "$self_uid" == "0" ]]; then root=true; fi
if [[ "$self_user" == "actions-runner" ]]; then legacy_user=true; fi
if (( shared_count > 1 )); then
  distinct_uid_status="FAIL_SHARED_UID_OBSERVED"
elif [[ "$legacy_user" == true ]]; then
  distinct_uid_status="NOT_VERIFIED_LEGACY_USER"
else
  distinct_uid_status="NOT_VERIFIED_NEEDS_CROSS_UID_DENIAL"
fi
printf 'HOST_AUDIT_SCOPE=THIS_CI_PROCESS_ONLY\n'
printf 'HOST_AUDIT_ROOT_EXECUTION=%s\n' "$root"
printf 'HOST_AUDIT_LEGACY_SHARED_USER=%s\n' "$legacy_user"
printf 'HOST_AUDIT_INSTALLS_DISCOVERED=%s\n' "$directories_seen"
printf 'HOST_AUDIT_INSTALLS_OWNED_BY_CURRENT_UID=%s\n' "$shared_count"
printf 'HOST_AUDIT_INSTALLS_UNKNOWN_OWNER=%s\n' "$unknown_count"
printf 'HOST_AUDIT_ISOLATION_STATUS=%s\n' "$distinct_uid_status"
printf 'HOST_AUDIT_HOST_PRIVILEGE_AND_MOUNTS=NOT_VERIFIED\n'
printf 'HOST_AUDIT_EXACT_SHA=CI_LOG_ONLY\n'
# Observation intentionally doesn't fail CI; the security finding is a separate release gate.
