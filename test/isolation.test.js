// GRH-003/004/121/123/124 — non-destructive contract tests.
// They do not install, stop, remove or register a live runner.
const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const setup = path.join(__dirname, '..', 'scripts', 'runner-setup-linux.sh');
const lifecycle = path.join(__dirname, '..', 'scripts', 'runner-lifecycle-linux.sh');
const electron = path.join(__dirname, '..', 'src', 'main', 'main.js');
const workflow = path.join(__dirname, '..', '.github', 'workflows', 'ci.yml');
function plan(repo) {
  return spawnSync('bash', [setup, '--plan', repo], { encoding: 'utf8', timeout: 5000 });
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
