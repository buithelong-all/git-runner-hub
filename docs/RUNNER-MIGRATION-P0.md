# P0 migration playbook — per-repo GitHub runner identity

**State:** reversible side-by-side staging implementation. No installed service, user, permissions, secrets or workflow is changed until the owner separately approves the host command.

## Prerequisites and stop conditions

Choose a maintenance window. Record which repositories have their own running runner, recent successful CI run, working checkout and expected service. Preserve current configurations/backups under administrator-controlled permissions; NEVER attach secrets or backup contents to a GitHub PR.

Do not mutate a host if another CI job is running, if the runner has credentials for another project, if UID ownership is unknown, if there is no rollback plan, or if the owner has not authorized an actual service cutover.

## Read-only evidence (run locally as authorized administrator)

1. Determine intended repo and slug; run: bash scripts/runner-setup-linux.sh --plan OWNER/REPO
2. Inspect service and UID without displaying token contents:
   - systemctl list-units --all 'actions.runner*'
   - ps -eo user,pid,args | grep '[R]unner.Listener' (redact sensitive command parameters before sharing)
   - stat -c '%n %U %G %a' /opt/actions-runner-OWNER-REPO /home/actions-runner/work-OWNER-REPO
   - getent passwd actions-runner and getent passwd ghr-<digest from --plan>
   - id actions-runner (validate its groups; never assume no sudo/docker access)
   - findmnt -T /home/actions-runner
3. Check that no other runner user can traverse the target workspace; audit parent directory traversal rights and relevant ACLs. A 0700 directory under the same UID does not isolate two repos.
4. Read GitHub Actions runner status in the corresponding repository. If the connector lacks the runner-admin endpoint, use your authorized local gh CLI; do not paste registration tokens into chat.
5. Inventory only names/types of secrets/mounts exposed to the service, not their values.

## Controlled cutover (separate host authorization)

- Generate the non-mutating stage plan with `bash scripts/runner-migration-linux.sh plan OWNER/REPO`. Record the exact new account, runner name, label and paths.
- Before staging, back up the legacy systemd unit and the legacy runner's `.runner`, `.credentials` and `.credentials_rsaparams` files to an administrator-controlled `0700` directory. Do not print or attach their contents. Record owner/mode and a checksum manifest. This backup is the rollback safety copy; staging does not modify it.
- Obtain a short-lived registration token and pass it only on stdin: `gh api --method POST repos/OWNER/REPO/actions/runners/registration-token --jq .token | sudo bash scripts/runner-setup-linux.sh --stage-migration OWNER/REPO -`. The explicit migration mode requires a real legacy directory, creates only digest-suffixed paths and registers a distinct runner with only its `grh-<digest>` label. It never chowns, replaces, stops or removes the legacy runner.
- Repeating a completed stage is non-mutating: validated account/path/mode/config state returns `MIGRATION_ALREADY_STAGED`. Partial or unexpected state fails closed for manual inspection.
- Route a verification workflow explicitly to `[grh-<digest>]`; do not add generic labels to the staged runner. Validate process UID, `0700` owners/modes and bidirectional cross-UID denial before treating the host gate as passed.
- On WSL, UID separation must additionally be checked against Windows drvfs paths and interoperability. Apply the separately reviewed staged-service sandbox (`scripts/runner-sandbox-linux.sh`) before accepting jobs; verify the root-owned startup checker and the same probes from inside an actual job. Root's `runuser` outside the service does not share its mount restrictions. See `docs/evidence/HOST-SANDBOX-2026-10-15.md` for the observed scope, controls and remaining gaps.
- Run two successful CI jobs for the exact candidate SHA and record run IDs, runner name and label. A queued run, a run on the legacy name, or a different SHA does not count.
- Only after those two runs and a fresh GitHub `busy=false` check, use `sudo bash scripts/runner-migration-linux.sh cutover OWNER/REPO --verified-runs 2`. The script also refuses a locally observed `Runner.Worker`; it stops only the legacy service and deletes nothing.
- Rollback is `sudo bash scripts/runner-migration-linux.sh rollback OWNER/REPO`. It refuses a busy staged runner, stops the staged service, starts the preserved legacy service, and attempts to restart staging if legacy start fails.
- Only after owner confirmation perform cleanup of the old shared service, registration and stale files. No destructive migration on initial app setup.

### Required approval packet per repository

Before any sudo mutation, present: the exact repository; commands; new UID/name/label/paths; legacy service and backup destination; expected changes; checks for idle state; rollback command; and the statement that neither runner is unregistered or deleted. Approval for one repository does not authorize the next repository.

## Execution-level acceptance

HOST-01: each repository uses a distinct OS UID; directory owners/modes observed on host.
HOST-02: test process running as repo A UID gets permission denied reading repo B's managed workspace.
HOST-03: no passwordless sudo, Docker socket, shared secret home or privileged/unsafe mounts.
HOST-04: no unreviewed same-repo or fork PR can execute on a persistent privileged runner.
HOST-05: real run on exact SHA, intended runner and service identity, with readback.
Until all are observed, preserve HOST_ISOLATION_NOT_VERIFIED and avoid running untrusted PR code or real personal data.
