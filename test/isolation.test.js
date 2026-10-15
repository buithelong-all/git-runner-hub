// GRH-003/004/121/123/124 — non-destructive contract tests.
// They do not install, stop, remove or register a live runner.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const setup = path.join(__dirname, '..', 'scripts', 'runner-setup-linux.sh');
const lifecycle = path.join(__dirname, '..', 'scripts', 'runner-lifecycle-linux.sh');
const migration = path.join(__dirname, '..', 'scripts', 'runner-migration-linux.sh');
const electron = path.join(__dirname, '..', 'src', 'main', 'main.js');
const workflow = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
const validate = path.join(__dirname, '..', 'scripts', 'ci', 'validate.sh');
function plan(repo) {
  return spawnSync('bash', [setup, '--plan', repo], { encoding: 'utf8', timeout: 5000 });
}
function migrationPlan(repo) {
  return spawnSync('bash', [setup, '--plan-migration', repo], { encoding: 'utf8', timeout: 5000 });
}
function createMigrationFixture(repo) {
  const root = mkdtempSync(path.join(os.tmpdir(), 'grh-migration-'));
  const slug = repo.replace('/', '-');
  const staged = JSON.parse(migrationPlan(repo).stdout);
  const legacyDir = path.join(root, 'opt', `actions-runner-${slug}`);
  const stagedDir = path.join(root, staged.runner_dir);
  const workDir = path.join(root, staged.work_dir);
  const homeDir = path.join(root, staged.home_dir);
  for (const dir of [workDir, homeDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  for (const dir of [legacyDir, stagedDir]) {
    mkdirSync(dir, { recursive: true, mode: 0o700 });
    writeFileSync(path.join(dir, '.service-running'), 'running\n', { mode: 0o600 });
    writeFileSync(path.join(dir, 'svc.sh'), `#!/usr/bin/env bash
set -euo pipefail
case "$1" in
  status) [[ -f .service-running ]] ;;
  start) printf 'running\\n' > .service-running ;;
  stop) rm -f .service-running ;;
  *) exit 2 ;;
esac
`, { mode: 0o700 });
    chmodSync(dir, 0o700);
  }
  return { root, legacyDir, stagedDir, workDir, homeDir };
}
function runMigration(args, fixture) {
  return spawnSync('bash', [migration, ...args, '--root-prefix', fixture.root], {
    encoding: 'utf8',
    timeout: 5000,
    env: { ...process.env, GITRUNNERHUB_TESTING: '1' }
  });
}
test('Linux setup plan returns a unique OS account and workspace for each repo', () => {
  const a = plan('buithelong-all/DanhTinh-Lab');
  const b = plan('buithelong-all/caevietnam.vn');
  assert.equal(a.status, 0, a.stderr);
  assert.equal(b.status, 0, b.stderr);
  const x = JSON.parse(a.stdout), y = JSON.parse(b.stdout);
  assert.match(x.service_user, /^ghr-[a-f0-9]{12}$/);
  assert.match(y.service_user, /^ghr-[a-f0-9]{12}$/);
  assert.notEqual(x.service_user, y.service_user);
  assert.notEqual(x.runner_dir, y.runner_dir);
  assert.notEqual(x.work_dir, y.work_dir);
  assert.notEqual(x.home_dir, y.home_dir);
  assert.equal(x.legacy_overwrite, false);
  assert.equal(x.runner_name, 'local-buithelong-all-DanhTinh-Lab');
  assert.equal(x.runner_dir.startsWith('/opt/actions-runner-'), true);
});
test('Linux setup rejects traversal, commands, flags and malformed repository input', () => {
  for (const repo of [
    '../wrong', 'owner/../repo', 'owner/repo/extra', 'owner/repo;touch /tmp/pwn',
    'owner/name with spaces', '--pretend/repo', 'owner/..', 'owner/name$(id)',
    '', 'owner//repo', 'owner\\repo', 'owner/repo\nother',
  ]) {
    const r = plan(repo);
    assert.notEqual(r.status, 0, 'unexpected accept: ' + JSON.stringify(repo));
    assert.equal(r.stdout.includes('service_user'), false);
  }
});
test('Linux setup plan cannot install or modify host on non-root test machine', () => {
  const out = plan('owner/test');
  assert.equal(out.status, 0);
  const identity = JSON.parse(out.stdout);
  assert.equal(identity.legacy_overwrite, false);
  assert.ok(identity.work_dir.includes(identity.service_user.slice(4)));
});
test('Migration plan stages a distinct runner and preserves the legacy installation', () => {
  const result = migrationPlan('buithelong-all/git-runner-hub');
  assert.equal(result.status, 0, result.stderr);
  const planned = JSON.parse(result.stdout);
  assert.equal(planned.mode, 'migration-stage');
  assert.equal(planned.legacy_preserved, true);
  assert.match(planned.service_user, /^ghr-[a-f0-9]{12}$/);
  assert.match(planned.runner_name, /^local-buithelong-all-git-runner-hub-isolated-[a-f0-9]{12}$/);
  assert.match(planned.runner_label, /^grh-[a-f0-9]{12}$/);
  assert.equal(planned.default_labels, false);
  assert.equal(planned.path_mode, '0700');
  assert.notEqual(planned.runner_dir, planned.legacy_runner_dir);
});
test('Migration cutover rejects busy legacy runner and fewer than two verified runs', () => {
  const fixture = createMigrationFixture('owner/repo');
  try {
    writeFileSync(path.join(fixture.legacyDir, '.runner-busy'), 'busy\n');
    const busy = runMigration(['cutover', 'owner/repo', '--verified-runs', '2'], fixture);
    assert.equal(busy.status, 6);
    assert.match(busy.stderr, /LEGACY_RUNNER_BUSY/);
    rmSync(path.join(fixture.legacyDir, '.runner-busy'));
    const insufficient = runMigration(['cutover', 'owner/repo', '--verified-runs', '1'], fixture);
    assert.equal(insufficient.status, 6);
    assert.match(insufficient.stderr, /TWO_VERIFIED_RUNS_REQUIRED/);
    assert.equal(existsSync(path.join(fixture.legacyDir, '.service-running')), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('Migration cutover and rollback are idempotent and preserve both installations', () => {
  const fixture = createMigrationFixture('owner/repo');
  try {
    const firstCutover = runMigration(['cutover', 'owner/repo', '--verified-runs', '2'], fixture);
    assert.equal(firstCutover.status, 0, firstCutover.stderr);
    const secondCutover = runMigration(['cutover', 'owner/repo', '--verified-runs', '2'], fixture);
    assert.equal(secondCutover.status, 0, secondCutover.stderr);
    assert.match(secondCutover.stdout, /CUTOVER_ALREADY_APPLIED/);
    assert.equal(existsSync(fixture.legacyDir), true);
    assert.equal(existsSync(fixture.stagedDir), true);

    const rollback = runMigration(['rollback', 'owner/repo'], fixture);
    assert.equal(rollback.status, 0, rollback.stderr);
    const repeatedRollback = runMigration(['rollback', 'owner/repo'], fixture);
    assert.equal(repeatedRollback.status, 0, repeatedRollback.stderr);
    assert.match(repeatedRollback.stdout, /ROLLBACK_ALREADY_APPLIED/);
    assert.equal(existsSync(path.join(fixture.legacyDir, '.service-running')), true);
    assert.equal(existsSync(path.join(fixture.stagedDir, '.service-running')), false);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('Migration refuses destructive actions', () => {
  const result = spawnSync('bash', [migration, 'delete', 'owner/repo'], { encoding: 'utf8', timeout: 5000 });
  assert.equal(result.status, 2);
  assert.match(result.stderr, /INVALID_ACTION/);
});
test('Migration refuses unsafe ownership modes before service mutation', () => {
  const fixture = createMigrationFixture('owner/repo');
  try {
    chmodSync(fixture.stagedDir, 0o755);
    const result = runMigration(['status', 'owner/repo'], fixture);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /PATH_MODE_MISMATCH/);
    assert.equal(existsSync(path.join(fixture.legacyDir, '.service-running')), true);
    assert.equal(existsSync(path.join(fixture.stagedDir, '.service-running')), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('Migration refuses cutover when a managed work or home path is missing', () => {
  const fixture = createMigrationFixture('owner/repo');
  try {
    rmSync(fixture.workDir, { recursive: true });
    const result = runMigration(['cutover', 'owner/repo', '--verified-runs', '2'], fixture);
    assert.equal(result.status, 4);
    assert.match(result.stderr, /UNSAFE_OR_MISSING_PATH/);
    assert.equal(existsSync(path.join(fixture.legacyDir, '.service-running')), true);
  } finally {
    rmSync(fixture.root, { recursive: true, force: true });
  }
});
test('Migration setup never echoes a token supplied in an invalid command argument', () => {
  const fakeToken = 'NOT_A_REAL_TOKEN_1234567890';
  const result = spawnSync('bash', [setup, '--stage-migration', 'owner/repo', fakeToken], {
    encoding: 'utf8', timeout: 5000
  });
  assert.notEqual(result.status, 0);
  assert.doesNotMatch(`${result.stdout}${result.stderr}`, new RegExp(fakeToken));
});
test('CI lock is private per UID so isolated runner users cannot block each other', () => {
  const runtimeDir = mkdtempSync(path.join(os.tmpdir(), 'grh-runtime-'));
  try {
    const result = spawnSync('bash', [validate, '--lock-probe'], {
      encoding: 'utf8', timeout: 5000,
      env: { ...process.env, XDG_RUNTIME_DIR: runtimeDir }
    });
    assert.equal(result.status, 0, result.stderr);
    const match = result.stdout.match(/CI_LOCK_PATH=(.+)/);
    assert.ok(match, result.stdout);
    assert.equal(path.dirname(match[1]), runtimeDir);
    assert.match(path.basename(match[1]), /^git_runner_hub_ci_[0-9]+\.lock$/);
    const mode = require('node:fs').statSync(match[1]).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    rmSync(runtimeDir, { recursive: true, force: true });
  }
});
test('Provisioner refuses legacy overwrite and enforces verified archive and per-repo UID', () => {
  const src = readFileSync(setup, 'utf8');
  assert.match(src, /LEGACY_RUNNER_DIR/);
  assert.match(src, /EXISTING_RUNNER_DETECTED/);
  assert.match(src, /SERVICE_IDENTITY_EXISTS/);
  assert.match(src, /useradd --system --user-group/);
  assert.match(src, /chmod 0700 "\$RUNNER_DIR" "\$WORK_DIR" "\$HOME_DIR"/);
  assert.match(src, /sha256sum --check --status/);
  assert.match(src, /TOKEN_MUST_BE_STDIN/);
  assert.doesNotMatch(src, /^\s*(?!#).*--replace/m);
  assert.doesNotMatch(src, /useradd\s+.*\sactions-runner/);
});
test('Lifecycle rejects automatic legacy detach and removes only validated managed paths', () => {
  const src = readFileSync(lifecycle, 'utf8');
  assert.match(src, /LEGACY_SHARED_UID/);
  assert.match(src, /WORKSPACE_OWNER_MISMATCH/);
  assert.match(src, /REMOVE_TOKEN_MUST_BE_STDIN/);
  assert.match(src, /runuser -u "\$SERVICE_USER"/);
  assert.match(src, /rm -rf -- "\$RUNNER_DIR" "\$WORK_DIR"/);
});
test('Electron WSL path uses private staging and stdin instead of registration token argv', () => {
  const src = readFileSync(electron, 'utf8');
  assert.match(src, /\/run\/gitrunnerhub\/runner-setup\.sh/);
  assert.match(src, /execProc\.stdin\.end\(regToken \+ '\\n'\)/);
  assert.match(src, /execProc\.stdin\.end\(action === 'detach' \? removeToken/);
  assert.doesNotMatch(src, /'\/tmp\/git-runner-setup\.sh', repoFullName, regToken/);
  assert.doesNotMatch(src, /Token hợp lệ:.*regToken\.substring/);
});
test('Persistent self-hosted workflow rejects fork PR and avoids checkout credential retention', () => {
  const src = readFileSync(workflow, 'utf8');
  assert.match(src, /pull_request\.head\.repo\.full_name == github\.repository/);
  assert.match(src, /persist-credentials: false/);
  assert.match(src, /contents: read/);
  assert.match(src, /runs-on: \[self-hosted, Linux, X64\]/);
});
