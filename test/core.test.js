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
  assert.equal(priv.status, 'WARNING');
  assert.equal(priv.allowForkPRs, false);

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

test('Runner Lifecycle & Checksums (GRH-125..128)', () => {
  const { getRunnerChecksum, getServiceUnitName, parseRunnerList } = require('../src/core/runner');
  
  assert.equal(getRunnerChecksum('linux', 'x64'), '7ea4d6350325d975a507851d7fe31d17d59850cfdf15bfbc1309d43d1a8e104d');
  assert.equal(getRunnerChecksum('macos', 'arm64'), 'a6e3557e2df283bc486adbc4ce42ec5304192b02787e9c3cf0c1ea354bbbe5ea');
  assert.equal(getRunnerChecksum('invalid', 'arch'), null);

  const unit = getServiceUnitName('buithelong-all-caevietnam.vn');
  assert.ok(unit.includes('actions.runner'));

  const parsed = parseRunnerList([
    { id: 1, name: 'local-caevietnam.vn', status: 'online', busy: false },
    { id: 2, name: 'other-runner', status: 'offline', busy: false }
  ], 'caevietnam.vn');

  assert.equal(parsed.length, 2);
  assert.equal(parsed[0].isTargetRepo, true);
  assert.equal(parsed[1].isTargetRepo, false);
});

test('Workflow Routing & Patching (GRH-140..149)', () => {
  const { inspectWorkflow, generateProposedPatch, verifyRunExecution } = require('../src/core/workflow');

  const githubHostedYaml = `
name: Test
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - run: npm test
`;
  const info = inspectWorkflow(githubHostedYaml);
  assert.equal(info.routing, 'GITHUB_HOSTED');
  assert.equal(info.hasDuplicateTriggers, true);
  assert.equal(info.isDeployWorkflow, false);
  assert.equal(info.hasConcurrency, false);

  const patched = generateProposedPatch(githubHostedYaml, 'my-repo-local');
  assert.ok(patched.includes('runs-on: [self-hosted, Linux, X64, my-repo-local]'));
  assert.ok(patched.includes('concurrency:'));

  const deployYaml = `
name: Deploy Production
on:
  push:
    branches: [main]
jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - run: deploy.sh
`;
  const deployInfo = inspectWorkflow(deployYaml);
  assert.equal(deployInfo.isDeployWorkflow, true);

  const v1 = verifyRunExecution({ runner_name: 'local-caevietnam.vn' }, 'local-caevietnam.vn');
  assert.equal(v1.verified, true);

  const v2 = verifyRunExecution({ runner_name: 'GitHub-Actions-Hosted' }, 'local-caevietnam.vn');
  assert.equal(v2.verified, false);
});

test('Evidence & Failure Classification (GRH-161, GRH-165)', () => {
  const { createEvidenceRecord, classifyFailure } = require('../src/core/evidence');

  const ev = createEvidenceRecord({
    repository: 'buithelong-all/caevietnam.vn',
    sha: 'e111d91',
    isClean: true,
    exitCode: 0,
    runnerName: 'long-local-ci'
  });

  assert.equal(ev.status, 'PASS');
  assert.equal(ev.sha, 'e111d91');

  // Test phân loại failure
  const pass = classifyFailure(0);
  assert.equal(pass.type, 'NONE');

  const diskErr = classifyFailure(1, 'Error: ENOSPC: no space left on device');
  assert.equal(diskErr.type, 'INFRASTRUCTURE_FAILURE');
  assert.equal(diskErr.reason, 'DISK_FULL');

  const permErr = classifyFailure(126, 'Permission denied');
  assert.equal(permErr.type, 'INFRASTRUCTURE_FAILURE');
  assert.equal(permErr.reason, 'PERMISSION_DENIED');

  const testFail = classifyFailure(1, 'AssertionError [ERR_ASSERTION]: Expected true to be false');
  assert.equal(testFail.type, 'PRODUCT_TEST_FAILURE');
});
