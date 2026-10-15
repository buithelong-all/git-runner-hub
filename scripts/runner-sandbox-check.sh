#!/usr/bin/env bash
# Runs as ExecStartPre and in CI, inside the service's actual namespaces.
# Uses permission predicates only; never opens another repository's files.
set -euo pipefail
[[ $# == 1 && "$1" =~ ^[A-Za-z0-9][A-Za-z0-9_.-]*/[A-Za-z0-9][A-Za-z0-9_.-]*$ && "$1" != *..* ]] || exit 2
slug=${1/\//-}
digest=$(printf %s "$1" | tr '[:upper:]' '[:lower:]' | sha256sum | cut -c1-12)
[[ $(id -un) == ghr-$digest && $(id -u) != 0 ]] || exit 3
deny_read() { if test -r "$1"; then printf 'SANDBOX_READ_ALLOWED=%s\n' "$1" >&2; exit 4; fi; }
deny_traverse() { if test -x "$1"; then printf 'SANDBOX_TRAVERSE_ALLOWED=%s\n' "$1" >&2; exit 4; fi; }
for dir in /mnt/c /mnt/d /mnt/wslg /media /run/WSL /usr/lib/wsl /run/dbus /run/user /home /root; do deny_traverse "$dir"; done
test -r /etc/resolv.conf
test ! -w /etc/resolv.conf
for file in /init /proc/1/root/mnt/d /proc/1/root/opt/actions-runner/.credentials /opt/actions-runner/.credentials /opt/actions-runner-buithelong-all-DanhTinh-Lab/.credentials; do deny_read "$file"; done
deny_read '/mnt/d/Chatgpt/Github/Danh Tinh Lab/app/package.json'
for dir in /opt/actions-runner-$slug-$digest /var/lib/gitrunnerhub/home-$slug-$digest /var/lib/gitrunnerhub/work-$slug-$digest; do
  test -w "$dir"
  test "$(stat -c %u:%a "$dir")" = "$(id -u):700"
done
grep -q '^NoNewPrivs:[[:space:]]*1$' /proc/self/status
grep -q '^CapBnd:[[:space:]]*0000000000000000$' /proc/self/status
if unshare --mount -- true 2>/dev/null; then echo NAMESPACE_ESCAPE_ALLOWED >&2; exit 4; fi
if test -n "${WSL_INTEROP:-}"; then echo INTEROP_ENV_PRESENT >&2; exit 4; fi
printf 'SANDBOX_CHECK=PASS UID=%s\n' "$(id -u)"
