# Host audit — 2026-10-15 (redacted, read-only)

## Initial audit scope and status (before approved staging)

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

## Approved staging and rollback — 2026-10-15

The owner approved backup and staging for `buithelong-all/git-runner-hub` only. The `DanhTinh-Lab` and `caevietnam.vn` services were not modified.

### Backup

- Destination: `/var/backups/gitrunnerhub/20261015-766f370-git-runner-hub`, root-owned mode `0700`; backup files mode `0600`.
- Copied legacy `.runner`, `.credentials`, `.credentials_rsaparams`, `.service` and the exact systemd unit. Each copy compared equal to its source. A private metadata record and SHA-256 manifest were created and checked without printing contents or hashes.
- The backup directory name records the original approval source. The actual successful installer source was subsequently corrected to `ca178e983382614447af0757cb00f215085a3217` as described below.

### Checksum failure and correction

- Initial staging at `766f370039a1c94b73c4c387d27d336db400329c` failed with `RUNNER_CHECKSUM_MISMATCH`, before user/path/service creation. The installer deleted its temporary download through its existing cleanup trap.
- GitHub's official `actions/runner` v2.338.0 release asset metadata reported Linux x64 digest `sha256:af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32` (asset size 227660598 bytes). The previous pin was incorrect.
- Commit `ca178e983382614447af0757cb00f215085a3217` corrected the Linux x64 pin in provisioner and core. Regression test was observed failing before the correction; all 23 tests passed afterwards. The second staging download passed the checksum guard.
- [CI run 38673136216](https://github.com/buithelong-all/git-runner-hub/actions/runs/38673136216) succeeded at this exact SHA, on legacy runner `local-buithelong-all-git-runner-hub`. This does not count toward new-runner acceptance.

### Observed staged runner

- Account `ghr-3605dc3bbe4d`, UID `997`, GID `985`, shell `/usr/sbin/nologin`.
- `runsvc.sh` and `Runner.Listener` actually ran as UID 997.
- Runner name `local-buithelong-all-git-runner-hub-isolated-3605dc3bbe4d`, GitHub registration ID 22, observed online and idle, with only label `grh-3605dc3bbe4d`.
- Digest-suffixed runner, home and work directories all observed owner `997:985`, mode `0700`.
- No sudo privileges for the new account.

### Cross-access results (permission predicates only; no secret contents read)

| Probe | Exit | Result |
| --- | --- | --- |
| Legacy UID 1000 reads new managed workspace | 1 | Denied |
| New UID 997 reads legacy DanhTinh-Lab workspace | 1 | Denied |
| New UID 997 traverses legacy DanhTinh-Lab workspace | 1 | Denied |
| Legacy UID 1000 reads new runner `.credentials` | 1 | Denied |
| New UID 997 reads legacy DanhTinh-Lab install directory | 0 | Allowed |
| New UID 997 reads legacy DanhTinh-Lab `.credentials` | 0 | **Allowed: host gate failure** |
| New UID 997 reads legacy DanhTinh-Lab `.credentials_rsaparams` | 1 | Denied |

The old `/home/actions-runner` mode `0750` protects its workspaces from the new UID. The legacy install directory `0755` and `.credentials` mode `0664` leave a cross-repository credential-file read path. Do not infer usable credentials or secret contents from `test -r`; no contents were opened. Distinct UIDs alone do not close this finding.

### Verified safe rollback and remaining gates

- On host validation failure, stopped the exact new service using systemd and disabled its autostart. The enablement symlink created during staging was removed; the service unit, registration, account, directories and backup were retained.
- Observed new service `inactive/dead`, `MainPID=0`, no remaining processes for UID 997. Legacy service remained `active/running`, UID 1000, MainPID 122, with GitHub online/idle observation.
- This verifies retreat from staging while the original runner remains operational. It does **not** verify stop/start recovery of a legacy runner after cutover; no legacy cutover was performed.
- `CODE_TEST_PASS`: 23/23 local tests and successful exact-SHA legacy CI at `ca178e9...`.
- `HOST_ISOLATION_VERIFIED`: **NOT_VERIFIED / REQUEST_CHANGES**, because cross-repository credential-file readability remains.
- New-runner CI: **0/2**, intentionally not dispatched after host gate failure. Full migration rollback after a legacy cutover: **NOT_RUN**.
- Further work needs a reviewed, separately authorized remedy for existing legacy credential permissions or service sandboxing; do not silently chmod/chown another repository's existing runner. `DanhTinh-Lab` PR #14 follow-on remains gated on successful host acceptance.
