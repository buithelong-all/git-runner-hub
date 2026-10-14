# Host audit — 2026-10-15 (redacted, read-only)

## Scope and status

- Host: owner's Windows laptop, Ubuntu WSL2; hostname and credential material omitted.
- Source inspected: Draft PR #2 at `4f990416fe12a5ab12869e3755193747b4b5e8ca`.
- Audit made no user, service, registration, ownership, workflow or runner configuration changes.
- Result: `CODE_TEST_PASS` for the local candidate (23/23 tests plus Windows Electron package build); `HOST_ISOLATION_NOT_VERIFIED`; migration not started.

## Observations

- Three systemd Actions runner services were active: `caevietnam.vn`, `DanhTinh-Lab`, and `git-runner-hub`.
- GitHub reported all three corresponding runners `online` and `busy=false` at observation time. Their labels still included the generic `self-hosted`, `Linux`, and `X64` set.
- All three `Runner.Listener` processes ran as `actions-runner`, UID/GID `1000:1000`.
- The two migration targets used separate `/opt/actions-runner-<owner>-<repo>` directories, but both directories were owned by UID 1000 and mode `0755`.
- UID 1000 passed non-content `test -r` and `test -w` checks for both target runner directories and both `.runner` files. The `.runner` files were mode `0664`. This confirms shared-UID cross-repository access; it is not process isolation.
- The `actions-runner` account had no supplementary groups and `sudo -n -l` denied sudo. `/var/run/docker.sock` was absent. The runner filesystem was WSL ext4.
- No `_work` directory existed while the runners were idle, so a workspace-content denial test could not be performed. The installation/config cross-access result already fails the isolation gate.

## Gate interpretation

- `CODE_TEST_PASS`: input baseline had 15/15 tests passing in Linux after correcting checkout line endings only; the migration candidate then passed 23/23 tests, shell syntax checks and the Electron directory build.
- `HOST_ISOLATION_VERIFIED`: **NOT_VERIFIED**. Distinct UIDs and bidirectional access denial do not exist yet.
- No claim is made about secure mounts, network isolation, secret lifetime, or production readiness.
- Legacy services remain the rollback baseline and must not be stopped, detached, chowned, overwritten or deleted without separate per-repository owner approval.
