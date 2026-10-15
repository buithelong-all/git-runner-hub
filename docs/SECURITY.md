# GitRunnerHub security boundary — P0 candidate (2026-10-15)

This document distinguishes the intended security policy from an inspected host state. No host audit, service migration or independent security attestation is implied by this PR.

## Trust levels

- Private does **not** mean trusted executable code. A writable branch from a permitted collaborator or agent can still run hostile commands on a persistent runner.
- Block external fork PR workflows on persistent self-hosted runners. Require trusted review for same-repository changes when the runner machine contains other projects or host credentials.
- Never give the runner passwordless sudo, the Docker socket, cloud/SSH secrets or access to another repository's home/workspace by default.
- Source repository classification is a decision aid, not an OS-level security control.

## Linux/WSL new-runner isolation

The new installer derives a deterministic per-repository Unix service account named ghr-<12 hex digest>, using lowercase owner/repo SHA-256, and provisions an independent runner directory, service home and work directory. These paths are owned by the unique service account and receive permission 0700. The root-owned parent /var/lib/gitrunnerhub remains traversable. The installer verifies the x64 GitHub runner release SHA-256 *before* extraction.

The program's read-only --plan mode shows paths and identity without running sudo, requesting registration credentials, installing a service or creating files.

No existing /opt/actions-runner-<owner>-<repo> installation is replaced automatically. The old Linux provisioner reused the actions-runner UID for all repositories: directory separation was NOT process isolation because the UID was shared. Existing host accounts and running services have NOT been changed here.

## Registration token boundary

For Linux/WSL, the desktop app stages scripts in a private root-only /run/gitrunnerhub directory and transfers token text via child-process stdin instead of putting it in the setup script's argv. The Linux provisioner accepts a registration token only from stdin. Its invocation of the upstream config.sh still requires passing a short-lived token to GitHub's registration program, so transient process argument visibility is a residual risk; host procfs access restrictions require separate validation. Never print tokens or registration receipts to app logs.

The macOS provisioner is unchanged by this scoped patch and requires a separate secret/host isolation review. Do not extrapolate Linux evidence to macOS.

## Lifecycle and migration

Existing shared-UID runners can still be inspected and started/stopped with the legacy lifecycle path. Destructive detach of a legacy runner is **refused**. `runner-setup-linux.sh --stage-migration` creates a digest-suffixed account, home, work directory, runner directory, name and explicit-only label alongside the legacy installation. `runner-migration-linux.sh` permits only status, cutover and rollback; it has no delete/unregister action and refuses cutover below two verified runs or while the legacy worker is busy.

A new per-repo account's detach requires a repo-specific remove token via stdin; it refuses symlink/unknown-owner workspaces and does not delete local files if GitHub unregistration fails. The installer and migration helper cannot prove global process/network isolation or secure wipe.

Follow the read-only host checklist and cutover requirements in docs/RUNNER-MIGRATION-P0.md before changing a running machine.

## WSL staged-service sandbox

UID separation alone does not restrict drvfs Windows mounts. The supervised WSL staging path additionally uses `runner-sandbox-linux.sh`: an administrator-owned systemd drop-in with a root-owned `ExecStartPre` checker. This is a **service-process boundary**, not a claim that root's `runuser` invocation outside the service receives the same restrictions.

The service sees private read-only `/opt`, `/var/lib/gitrunnerhub` and `/mnt` trees, with only its own three managed directories bound writable. Only `/mnt/wsl/resolv.conf` is bound read-only for the host's WSL DNS symlink. Windows drives are absent. WSL `/init`, `/run/WSL`, `/usr/lib/wsl`, user/session buses, home directories and the host's process-root aliases are blocked or hidden. No capabilities, no new privileges and namespace restrictions prevent ordinary job children from remounting or joining a less restricted namespace. `KillMode=control-group` contains orphaned job processes during service stop.

The checker runs before the listener and again in CI. Host acceptance additionally requires a copied Windows PE probe to fail execution from the actual CI process, two successful same-SHA runs, and supervised rollback/restart evidence. The PE fixture is deliberately placed only in the staging workspace, never in repository sources.

This profile currently targets the audited systemd-enabled WSL host with `/mnt/wsl/resolv.conf`. It is not automatically applied by the existing desktop installer, and must not be described as a blanket fix for new desktop installations or macOS. Containers, Docker and namespace-based build tooling are intentionally unavailable under this policy. Network access remains available for GitHub; unrestricted network/localhost service isolation is not established by this filesystem profile. Kernel exploits and administrator/root actions are outside the observed boundary.

## Verification requirements

The Node test suite checks deterministic unique identities, safe repository input, non-destructive planning, critical script invariants, desktop stdin transport, fork blocking and checkout credential handling. Those tests **do not** establish that a service is running with the intended UID or that one repo cannot read another repo's files. Verify those properties on the actual Linux host, then run a real GitHub Actions job on the intended runner and collect exact SHA, runner name and test receipts.

The GitHub Actions CI workflow requests read-only contents, disables credential persistence and rejects external forks; it continues to require self-hosted Linux rather than spending hosted Actions minutes. A queued/no-run CI is NOT_RUN_ENVIRONMENT, not an application test PASS.
