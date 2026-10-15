#!/usr/bin/env bash
# Render/apply a fail-closed sandbox to a staged runner only. No legacy mutations.
set -euo pipefail
umask 077
[[ $# == 2 ]] || { echo 'USAGE: --render|apply|rollback OWNER/REPO' >&2; exit 2; }
action=$1
repo=$2
case "$action" in --render|apply|rollback) ;; *) echo INVALID_ACTION >&2; exit 2;; esac
[[ "$repo" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$ && "$repo" != *..* ]] || { echo INVALID_REPOSITORY >&2; exit 2; }
slug=${repo/\//-}
digest=$(printf %s "$repo" | tr '[:upper:]' '[:lower:]' | sha256sum | cut -c1-12)
user=ghr-$digest
runner=/opt/actions-runner-$slug-$digest
home_dir=/var/lib/gitrunnerhub/home-$slug-$digest
work=/var/lib/gitrunnerhub/work-$slug-$digest
unit=actions.runner.$slug.local-$slug-isolated-$digest.service
dropin=/etc/systemd/system/$unit.d/50-gitrunnerhub-sandbox.conf
checker=/usr/local/libexec/gitrunnerhub/sandbox-check.sh
backup=/var/backups/gitrunnerhub/sandbox-$digest-v1
render() {
  printf '%s\n' '[Service]' \
    'NoNewPrivileges=yes' 'CapabilityBoundingSet=' 'AmbientCapabilities=' \
    'ProtectSystem=strict' 'ProtectHome=yes' 'PrivateTmp=yes' 'PrivateDevices=yes' \
    'PrivateMounts=yes' 'ProtectProc=invisible' 'ProcSubset=pid' \
    'ProtectKernelTunables=yes' 'ProtectKernelModules=yes' 'ProtectKernelLogs=yes' \
    'ProtectControlGroups=yes' 'RestrictNamespaces=yes' \
    'RestrictRealtime=yes' 'LockPersonality=yes' 'SystemCallArchitectures=native' \
    'RestrictAddressFamilies=AF_UNIX AF_INET AF_INET6' \
    'InaccessiblePaths=-/media -/init -/run/WSL -/usr/lib/wsl -/run/user -/run/dbus -/run/systemd/private -/run/docker.sock -/proc/sys/fs/binfmt_misc' \
    'TemporaryFileSystem=/opt:ro /var/lib/gitrunnerhub:ro /mnt:ro' \
    'BindReadOnlyPaths=/mnt/wsl/resolv.conf' \
    "BindPaths=$runner $home_dir $work" \
    "ReadWritePaths=$runner $home_dir $work" \
    "Environment=HOME=$home_dir PATH=/usr/local/bin:/usr/bin:/bin" \
    'UnsetEnvironment=WSL_INTEROP WSLENV WSL_DISTRO_NAME XDG_RUNTIME_DIR DBUS_SESSION_BUS_ADDRESS' \
    'KillMode=control-group' 'TimeoutStopSec=30s' 'UMask=0077' \
    "ExecStartPre=/usr/bin/bash $checker $repo"
}
if [[ "$action" == --render ]]; then render; exit 0; fi
[[ $EUID == 0 ]] || { echo REQUIRES_ROOT >&2; exit 3; }
[[ "$(systemctl show -p User --value "$unit")" == "$user" ]] || { echo SERVICE_IDENTITY_MISMATCH >&2; exit 4; }
[[ "$(systemctl show -p ActiveState --value "$unit")" == inactive ]] || { echo STOP_STAGING_BEFORE_SANDBOX_CHANGE >&2; exit 4; }
if [[ "$action" == rollback ]]; then
  # Keep the service stopped; retain files for inspection. Never restore an unsafe running state.
  [[ -f "$dropin" && ! -L "$dropin" && "$(stat -c %u "$dropin")" == 0 ]]
  [[ ! -e "$backup/rolled-back-sandbox.conf" ]]
  mv -- "$dropin" "$backup/rolled-back-sandbox.conf"
  systemctl daemon-reload
  echo SANDBOX_ROLLED_BACK_SERVICE_LEFT_STOPPED
  exit 0
fi
[[ ! -e "$dropin" && ! -L "$dropin" && ! -e "$backup" ]] || { echo EXISTING_SANDBOX_STATE_REFUSED >&2; exit 4; }
for dir in "$runner" "$home_dir" "$work"; do
  [[ -d "$dir" && ! -L "$dir" && "$(stat -c %U:%a "$dir")" == "$user:700" ]] || { echo UNSAFE_MANAGED_PATH >&2; exit 4; }
done
source_dir=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)
install -d -o root -g root -m 0700 "$backup"
systemctl cat "$unit" > "$backup/unit-before.txt"
systemctl show "$unit" -p User -p ActiveState -p UnitFileState > "$backup/state-before.txt"
install -d -o root -g root -m 0755 /usr/local/libexec/gitrunnerhub
[[ ! -e "$checker" && ! -L "$checker" ]] || { echo EXISTING_CHECKER_REFUSED >&2; exit 4; }
install -o root -g root -m 0755 "$source_dir/runner-sandbox-check.sh" "$checker"
install -d -o root -g root -m 0755 "/etc/systemd/system/$unit.d"
render > "$dropin"
chmod 0644 "$dropin"
systemd-analyze verify "$unit"
systemctl daemon-reload
echo SANDBOX_INSTALLED_SERVICE_LEFT_STOPPED
