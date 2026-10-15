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
| New UID 997 reads legacy caevietnam.vn `.credentials` | 0 | **Allowed: host gate failure** |
| New UID 997 reads legacy DanhTinh-Lab `.credentials_rsaparams` | 1 | Denied |

The old `/home/actions-runner` mode `0750` protects its workspaces from the new UID. Both legacy install directories (`/opt/actions-runner` for caevietnam.vn and `/opt/actions-runner-buithelong-all-DanhTinh-Lab`) were observed `0755` with `.credentials` mode `0664`, leaving cross-repository credential-file read paths. Do not infer usable credentials or secret contents from `test -r`; no contents were opened. Distinct UIDs alone do not close this finding.

### Verified safe rollback and remaining gates

- On host validation failure, stopped the exact new service using systemd and disabled its autostart. The enablement symlink created during staging was removed; the service unit, registration, account, directories and backup were retained.
- Observed new service `inactive/dead`, `MainPID=0`, no remaining processes for UID 997. Legacy service remained `active/running`, UID 1000, MainPID 122, with GitHub online/idle observation.
- Final GitHub readback observed staging `offline`; its systemd autostart is `disabled`. Legacy remained online and was briefly busy processing the documentation PR update CI, which is expected operational traffic.
- This verifies retreat from staging while the original runner remains operational. It does **not** verify stop/start recovery of a legacy runner after cutover; no legacy cutover was performed.
- `CODE_TEST_PASS`: 23/23 local tests and successful exact-SHA legacy CI at `ca178e9...`.
- `HOST_ISOLATION_VERIFIED`: **NOT_VERIFIED / REQUEST_CHANGES**, because cross-repository credential-file readability remains.
- New-runner CI: **0/2**, intentionally not dispatched after host gate failure. Full migration rollback after a legacy cutover: **NOT_RUN**.
- Further work needs a reviewed, separately authorized remedy for existing legacy credential permissions or service sandboxing; do not silently chmod/chown another repository's existing runner. `DanhTinh-Lab` PR #14 follow-on remains gated on successful host acceptance.

## Approved permission trial, two CI attempts, and Windows mount blocker

This section supersedes the prior current-state summary. The owner approved changing exactly `/opt/actions-runner` and `/opt/actions-runner-buithelong-all-DanhTinh-Lab` to `0700`, preserving owners/content, restarting staging, and rolling back on verification failure without interrupting legacy runners.

- Before mutation both paths were ordinary directories, mode `0755`, owner `1000:1000`.
- Applied nonrecursive chmod `0700` to those two paths only; restarted only the staging service, keeping its autostart disabled.
- The real staging listener ran as UID 997. GitHub observed its sole label `grh-3605dc3bbe4d`, online/idle.
- Permission-only checks denied UID 997 access to both legacy `.credentials` files and the DanhTinh-Lab Linux workspace. UID 1000 was denied traversal of the new managed workspace. Owners remained unchanged.

### Exact-SHA CI receipts

Verification workflow checked out `github.event.pull_request.head.sha` explicitly and asserted the resulting Git HEAD, runner name, dedicated username, non-root UID, managed directory owners/modes, Linux cross-access denial and absence of sudo before running the 23-test suite.

Both independent job executions used source `0c0a3160e11447a00757dbbfd823f2d6811d7a9a`, runner `local-buithelong-all-git-runner-hub-isolated-3605dc3bbe4d`, requested label `grh-3605dc3bbe4d`:

| Receipt | Result | Job ID |
| --- | --- | --- |
| [Run 38673813733, attempt 1](https://github.com/buithelong-all/git-runner-hub/actions/runs/38673813733/attempts/1) | SUCCESS | 116222741349 |
| [Run 38673813733, attempt 2](https://github.com/buithelong-all/git-runner-hub/actions/runs/38673813733/attempts/2) | SUCCESS | 116222912932 |

This meets two successful executions on one exact SHA, but does not close the complete host gate below. It is not evidence for a later documentation/workflow-disable commit, nor for a second repository's dedicated UID.

### Wider host boundary failed

- `/mnt/d` is the Windows D: drive, mounted using drvfs/9p, read/write.
- A permission-only `test -r` executed as UID 997 returned **0** for `/mnt/d/Chatgpt/Github/Danh Tinh Lab/app/package.json`. The checkout's `.git` directory existence was independently confirmed. No file content was opened.
- `test -x /mnt/c/Users/Admin` as UID 997 returned **0**. This is a profile-traversal observation, not a claim that specific secrets were read.
- The actual service had empty `RootDirectory` and `InaccessiblePaths`, with `PrivateMounts=no`, `ProtectHome=no`, `ProtectSystem=no`, `NoNewPrivileges=no`. No service mount restriction was observed that would close the path accessible to its UID.
- Therefore Linux mode changes and successful CI do not prove isolation from other Windows-mounted repositories or the owner's Windows environment.

### Rollback and current disposition

- After confirming staging idle and both CI attempts complete, stopped only the staging service. Restored the two trial directory modes exactly to `0755`, owner `1000:1000`; no recursive changes or content edits.
- Verified legacy services remained active with unchanged MainPIDs: GitRunnerHub 122, DanhTinh-Lab 118, caevietnam.vn 119. Staging was inactive with MainPID 0 and autostart disabled.
- This rollback deliberately restores the prior legacy credential permission exposure; it does not remediate it. No untrusted job should be inferred safe on legacy runners.
- New files, registration, account and root-only backup are retained. The verification workflow is now disabled at its job condition so future PR updates do not queue jobs against a stopped or unverified staging runner.
- `CODE_TEST_PASS`: PASS at the tested `0c0a316...` source, 23 tests in both isolated CI attempts.
- `HOST_ISOLATION_VERIFIED`: **NOT_VERIFIED / REQUEST_CHANGES**, because Windows mount cross-repository access remains and only one repository's dedicated runner was provisioned.
- Rollback from this approved permission/staging trial is verified. A legacy cutover followed by restoration/restart is still **NOT_RUN**.
- No legacy cutover, second-repository migration, cleanup, merge, production deployment or DanhTinh-Lab PR #14 implementation was performed.
- Next decision requires a reviewed host boundary: e.g. service mount restrictions that also address WSL interoperability/escape paths, or a dedicated runner VM with no owner Windows-drive sharing. Do not disable WSL interoperability or unmount the owner's drives globally without explicit authorization.
