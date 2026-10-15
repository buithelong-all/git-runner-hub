const { test } = require('node:test');
const assert = require('node:assert/strict');

const {
  generateRepoLabel,
  detectPlatformLabels,
  generateRollbackPatch,
  verifyRunExecution,
  generateProposedPatch
} = require('../src/core/workflow');

test('GRH-207: Generate isolated unique runner label per repository', () => {
  assert.equal(generateRepoLabel('buithelong-all/DanhTinh-Lab'), 'grh-danhtinh-lab');
  assert.equal(generateRepoLabel('org-core/caevietnam.vn'), 'grh-caevietnam-vn');
  assert.equal(generateRepoLabel('user/my_special_repo!'), 'grh-my-special-repo');
});

test('GRH-209: Multi-Architecture & OS dynamic label detection', () => {
  const linuxX64 = detectPlatformLabels('linux', 'x64', 'grh-danhtinh-lab');
  assert.deepEqual(linuxX64, ['self-hosted', 'Linux', 'X64', 'grh-danhtinh-lab']);

  const macM1 = detectPlatformLabels('darwin', 'arm64', 'grh-repo-a');
  assert.deepEqual(macM1, ['self-hosted', 'macOS', 'ARM64', 'grh-repo-a']);

  const linuxArm = detectPlatformLabels('linux', 'arm64');
  assert.deepEqual(linuxArm, ['self-hosted', 'Linux', 'ARM64']);
});

test('GRH-210: 1-Click Rollback Patch from self-hosted back to ubuntu-latest', () => {
  const selfHostedYaml = `name: CI
on: [push]
jobs:
  test:
    runs-on: [self-hosted, Linux, X64, grh-danhtinh-lab]
    steps:
      - run: npm test
`;

  const rollback = generateRollbackPatch(selfHostedYaml);
  assert.ok(rollback.includes('runs-on: ubuntu-latest'));
  assert.ok(!rollback.includes('self-hosted'));
});

test('GRH-208: Verify Job Execution on Target Runner', () => {
  const validJob = {
    id: 123456,
    name: 'validate',
    runner_name: 'local-DanhTinh-Lab',
    conclusion: 'success'
  };

  const checkPass = verifyRunExecution(validJob, 'local-DanhTinh-Lab');
  assert.equal(checkPass.verified, true);
  assert.equal(checkPass.actualRunner, 'local-DanhTinh-Lab');

  const cloudJob = {
    id: 999999,
    name: 'validate',
    runner_name: 'GitHub Actions 42',
    conclusion: 'failure'
  };

  const checkFail = verifyRunExecution(cloudJob, 'local-DanhTinh-Lab');
  assert.equal(checkFail.verified, false);
});
