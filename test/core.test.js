/**
 * GitRunnerHub Unit Tests - Core Domain Logic [GRH-101, GRH-102]
 */

const test = require('node:test');
const assert = require('node:assert/strict');

const { Result } = require('../src/core/result');
const { parseRepoInput, isValidRepo } = require('../src/core/repo');
const { redactSecrets, classifyRepoSecurity } = require('../src/core/security');
const { getPlatformInfo } = require('../src/core/platform');

test('Result Contract (GRH-112, GRH-114)', () => {
  const ok = Result.success({ id: 123 });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.id, 123);
  assert.equal(ok.error, null);

  const fail = Result.failure('ERR_NOT_FOUND', 'Runner không tồn tại', 'Chạy setup trước');
  assert.equal(fail.ok, false);
  assert.equal(fail.code, 'ERR_NOT_FOUND');
  assert.equal(fail.error, 'Runner không tồn tại');
  assert.equal(fail.remediation, 'Chạy setup trước');
});

test('Repository Validation & Parsing (GRH-111)', () => {
  assert.equal(isValidRepo('buithelong-all/caevietnam.vn'), true);
  assert.equal(isValidRepo('buithelong-all/git-runner-hub'), true);
  assert.equal(isValidRepo('invalid_repo_name_without_slash'), false);
  assert.equal(isValidRepo(''), false);
  assert.equal(isValidRepo(null), false);

  const p1 = parseRepoInput('https://github.com/buithelong-all/caevietnam.vn');
  assert.equal(p1.ok, true);
  assert.equal(p1.value.fullName, 'buithelong-all/caevietnam.vn');
  assert.equal(p1.value.owner, 'buithelong-all');
  assert.equal(p1.value.name, 'caevietnam.vn');
  assert.equal(p1.value.label, 'caevietnam.vn-local');

  const p2 = parseRepoInput('git@github.com:buithelong-all/my-repo.git');
  assert.equal(p2.ok, true);
  assert.equal(p2.value.fullName, 'buithelong-all/my-repo');

  const p3 = parseRepoInput('invalid-format');
  assert.equal(p3.ok, false);
  assert.equal(p3.code, 'ERR_REPO_FORMAT');
});

test('Secret Redaction (GRH-155)', () => {
  const logWithToken = 'Configuring runner with token B7UIKS7ZH5EC5Z7RBOEB5DLKZX5XW on repo';
  const redacted = redactSecrets(logWithToken);
  assert.doesNotMatch(redacted, /B7UIKS7ZH5EC5Z7RBOEB5DLKZX5XW/);

  const logWithGhp = 'Using ghp_123456789012345678901234567890123456 to authenticate';
  const redactedGhp = redactSecrets(logWithGhp);
  assert.doesNotMatch(redactedGhp, /ghp_123456789012345678901234567890123456/);
});

test('Public vs Private Repo Security Classification (GRH-150..152)', () => {
  const priv = classifyRepoSecurity(true);
  assert.equal(priv.status, 'SAFE');
  assert.equal(priv.allowForkPRs, true);

  const pub = classifyRepoSecurity(false);
  assert.equal(pub.status, 'WARNING');
  assert.equal(pub.allowForkPRs, false);
});

test('Platform & Architecture Detection (GRH-120)', () => {
  const p = getPlatformInfo();
  assert.ok(['windows', 'macos', 'linux'].includes(p.type));
  assert.ok(['x64', 'arm64'].includes(p.runnerArch));
  assert.ok(p.runnerTarName.includes('2.338.0'));
});
