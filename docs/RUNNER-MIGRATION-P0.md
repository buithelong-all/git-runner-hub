# P0 migration playbook — per-repo GitHub runner identity

**State:** READ-ONLY procedure and implementation candidate. No installed service, user, permissions, secrets or workflow has been changed on the owner's Linux/WSL host by this repository update.

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

- Stop only the exact selected legacy service when it is idle, after saving its service/config state securely. Do not run the new installer over its existing directory.
- Select a new unique runner directory/account from --plan; provision via the reviewed installer only when the old installation's conflicting path and registration have been safely reconciled under a documented migration. Never automatically chown the old workspace from the shared account.
- Configure GitHub registration through ephemeral input, update workflow routing only if labels changed, and validate process UID, owner/mode of directories and that repository A cannot traverse repository B's per-UID directory.
- Check reverse access from the other repo, missing Docker socket and absence of passwordless sudo. Verify a successful same-SHA CI run from the intended runner.
- Preserve rollback until a second run passes: stop the new service and restore the prior service/configuration if validation fails, without destroying audit evidence.
- Only after owner confirmation perform cleanup of the old shared service, registration and stale files. No destructive migration on initial app setup.

## Execution-level acceptance

HOST-01: each repository uses a distinct OS UID; directory owners/modes observed on host.
HOST-02: test process running as repo A UID gets permission denied reading repo B's managed workspace.
HOST-03: no passwordless sudo, Docker socket, shared secret home or privileged/unsafe mounts.
HOST-04: no unreviewed same-repo or fork PR can execute on a persistent privileged runner.
HOST-05: real run on exact SHA, intended runner and service identity, with readback.
Until all are observed, preserve HOST_ISOLATION_NOT_VERIFIED and avoid running untrusted PR code or real personal data.
