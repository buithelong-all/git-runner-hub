# WSL staging sandbox — observed host evidence

This report supersedes the current-state conclusion of the earlier staging trials in `HOST-AUDIT-2026-10-15.md`, while retaining their failure history. Scope: the **new GitRunnerHub service only**, not every process with that UID, other repositories' legacy services, or the entire laptop.

## Source and runtime lock

- Tested source: `18341f1d564f1ac7cce21c3fe15082b5e5e2bdc4`.
- Runner: `local-buithelong-all-git-runner-hub-isolated-3605dc3bbe4d`; sole GitHub label `grh-3605dc3bbe4d`.
- Actual listener UID/GID `997:985`, account `ghr-3605dc3bbe4d`.
- New runner/home/work directories observed `0700`, owner `997:985`.
- Installed checker `/usr/local/libexec/gitrunnerhub/sandbox-check.sh` compared byte-identical to the tested source after rollback/restore.
- Root-owned drop-in: `/etc/systemd/system/actions.runner.buithelong-all-git-runner-hub.local-buithelong-all-git-runner-hub-isolated-3605dc3bbe4d.service.d/50-gitrunnerhub-sandbox.conf`.
- Root-only unit/state and successive profile/checker backups: `/var/backups/gitrunnerhub/sandbox-3605dc3bbe4d-v1`. Original registration/config backup remains retained separately.

## Observed service boundary

Systemd 259 provides a private filesystem view: `/opt` and `/var/lib/gitrunnerhub` expose only the three new runner paths as writable bind mounts; `/mnt` exposes only the read-only WSL DNS file. Windows drives, `/init`, `/run/WSL`, `/usr/lib/wsl`, user/session buses and Linux homes are unavailable. Other process roots are hidden. Capabilities are empty, `NoNewPrivileges=yes`, namespace creation/joining restricted, and service descendants stay in the service cgroup.

Checks executed inside `ExecStartPre`, a transient service with identical settings, and the actual GitHub CI process:

- Managed directories are owned by the effective dedicated UID, mode `0700`, writable by their owner.
- Windows `/mnt/c`, `/mnt/d` and `/mnt/wslg` paths are not traversable.
- The previously readable DanhTinh-Lab Windows checkout package file is not readable.
- Legacy runner credentials under `/opt` and the DanhTinh-Lab Linux workspace are inaccessible.
- `/init`, WSL socket/library paths and other-process root aliases are inaccessible.
- `NoNewPrivs=1`, `CapBnd=0000000000000000`; `unshare --mount` is denied; `WSL_INTEROP` is unset.
- Nested tar extraction succeeds before the runner accepts jobs.
- Legacy UID 1000 was already observed denied access to the new `0700` managed workspace. No legacy permissions were changed during this sandbox work.

## Windows executable positive and negative controls

A copy of the installed Windows `cmd.exe` is retained only at the staging work directory's `interop-probe.exe`, mode `0555`. The test runs only `/d /c "exit 0"`; it reads no user file and performs no Windows configuration changes.

- Outside the sandbox, invoked as UID 997: exit **0**. The fixture is executable and WSL interop really is available to that UID outside the service.
- In the identical transient sandbox: exec denied, exit **126**.
- In each accepted CI attempt: `WINDOWS_INTEROP_DENIED_RC=126`.

This distinguishes service-enforced denial from a broken binary or a machine-wide interop change. The owner's Windows mounts/interop remain enabled outside this service.

## Two successful CI executions on the same source

Both jobs explicitly checked out and asserted the PR head SHA `18341f1d564f1ac7cce21c3fe15082b5e5e2bdc4`, verified the runner name and effective account, executed the sandbox checker and Windows PE negative control, then passed **25/25 tests, zero failures**.

| Receipt | Job ID | Result |
| --- | --- | --- |
| [Run 38677255994, attempt 1](https://github.com/buithelong-all/git-runner-hub/actions/runs/38677255994/attempts/1) | 116233578482 | SUCCESS |
| [Run 38677255994, attempt 2](https://github.com/buithelong-all/git-runner-hub/actions/runs/38677255994/attempts/2) | 116233737983 | SUCCESS |

Subsequent evidence-only commits must not be represented as this exact tested SHA.

## Rollback/recovery rehearsal

After the two jobs completed and staging was idle:

1. Backed up the installed profile; stopped only staging.
2. Ran the migration sandbox helper's rollback action: moved the drop-in into the root-only backup, reloaded systemd and verified the service remained inactive. No unsandboxed listener was started.
3. Restored the exact saved root-owned drop-in, verified it with `systemd-analyze verify`, reloaded systemd and started staging.
4. `ExecStartPre` passed with status 0; effective listener UID 997 was observed again. Service returned active and GitHub online/idle. New MainPID 55606.
5. All three legacy services stayed active with unchanged MainPIDs: GitRunnerHub 122, DanhTinh-Lab 118, caevietnam.vn 119. Their directories retained original modes `0755`, owner `1000:1000`.

Staging autostart remains disabled, as established during the earlier rollback. The service is currently manually active. No runner registration, account, config or user data was deleted.

This verifies rollback/recovery of the service sandbox. A legacy cutover and subsequent legacy restart recovery remain **NOT_RUN**.

## Failures preserved, not promoted to PASS

- The first profile hid the WSL DNS symlink target. A file-only read-only DNS bind fixed connectivity without exposing Windows drives.
- A forced-stop command raced a replacement listener; that listener was restored. Run 38676395139 attempts 1 and 2 were cancelled and do not count as accepted executions.
- Run 38676892543 failed during action archive extraction. A nested-archive A/B probe reproduced GNU tar ENOSYS with systemd 259 `RestrictSUIDSGID=yes`, and passed with that option omitted ([upstream issue](https://github.com/systemd/systemd/issues/43314)). The final profile retains mandatory no-new-privileges, empty capabilities, mount and namespace restrictions. Its checker now tests nested extraction before listener startup.

## Gate interpretation and remaining scope

- `CODE_TEST_PASS`: PASS at `18341f1...`, including the two actual CI attempts above.
- `HOST_ISOLATION_VERIFIED`: observed PASS **only for the listed filesystem/interop controls of the new GitRunnerHub service**. This is not a global host/security attestation.
- Overall multi-repository migration: **NOT_VERIFIED / incomplete**. DanhTinh-Lab and caevietnam.vn legacy services still share UID 1000, are not sandboxed, and retain their known cross-access/Windows mount risks. Do not run untrusted legacy jobs under an assumption of full isolation.
- No legacy runner has been retired or unregistered. CI routing/cutover and migration of the second repository require the owner's per-repository approval packet.
- The sandbox requires systemd-enabled WSL with the audited DNS path; it is not yet integrated into default desktop provisioning. The renderer/root staging/token handling and macOS boundaries previously documented remain separate concerns.
- This profile intentionally prevents containers and user namespaces. Network/localhost service isolation, arbitrary kernel exploitation and hostile administrator actions are not proved safe by these checks.
- DanhTinh-Lab PR #14 implementation and production work remain gated; PR #2 stays Draft until the full acceptance scope is verified.
