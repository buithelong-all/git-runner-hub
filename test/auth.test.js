const test = require('node:test');
const assert = require('node:assert/strict');
const { parseScopes, isScopeSufficient, formatUserData } = require('../src/core/auth');

test('Auth Core - Scope Validation (GRH-201)', () => {
  const fullScopes = 'repo, read:org, workflow, gist';
  assert.equal(isScopeSufficient(fullScopes), true);

  const parsed = parseScopes(fullScopes);
  assert.ok(parsed.includes('repo'));
  assert.ok(parsed.includes('workflow'));

  const insufficient = 'read:user';
  assert.equal(isScopeSufficient(insufficient), false);

  const fineGrained = ''; // Fine-grained tokens don't send x-oauth-scopes header
  assert.equal(isScopeSufficient(fineGrained, true), true);
});

test('Auth Core - User Data Formatting (GRH-202)', () => {
  const rawApiUser = {
    login: 'octocat',
    name: 'The Octocat',
    avatar_url: 'https://avatars.githubusercontent.com/u/583231',
    id: 583231,
    html_url: 'https://github.com/octocat',
    email: 'octocat@github.com'
  };

  const formatted = formatUserData(rawApiUser);
  assert.equal(formatted.login, 'octocat');
  assert.equal(formatted.name, 'The Octocat');
  assert.equal(formatted.avatarUrl, 'https://avatars.githubusercontent.com/u/583231');
  assert.equal(formatted.initials, 'T');

  // Fallback when name is empty
  const noNameUser = { login: 'buithelong', avatar_url: '' };
  const formatted2 = formatUserData(noNameUser);
  assert.equal(formatted2.name, 'buithelong');
  assert.equal(formatted2.initials, 'B');
});

test('Auth Core - Multi-Account Lifecycle & Switching (GRH-201..203)', () => {
  const os = require('os');
  const path = require('path');
  const fs = require('fs');
  const {
    saveAccount,
    getActiveAccount,
    listAccounts,
    switchAccount,
    removeAccount,
    clearAllAccounts
  } = require('../src/core/auth');

  const tmpDir = path.join(os.tmpdir(), `grh-test-auth-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });

  try {
    // 1. Lưu tài khoản đầu tiên (userA)
    const userA = { login: 'developer-a', name: 'Alice Developer', avatarUrl: 'https://example.com/a.png' };
    saveAccount(tmpDir, 'token-alice-123', userA);

    let active = getActiveAccount(tmpDir);
    assert.equal(active.user.login, 'developer-a');
    assert.equal(active.token, 'token-alice-123');

    // 2. Lưu tài khoản thứ hai (userB)
    const userB = { login: 'developer-b', name: 'Bob Developer', avatarUrl: 'https://example.com/b.png' };
    saveAccount(tmpDir, 'token-bob-456', userB);

    active = getActiveAccount(tmpDir);
    assert.equal(active.user.login, 'developer-b'); // Vừa add nên thành active
    assert.equal(active.token, 'token-bob-456');

    // 3. Liệt kê danh sách tài khoản
    const accounts = listAccounts(tmpDir);
    assert.equal(accounts.length, 2);
    const accA = accounts.find(a => a.login === 'developer-a');
    const accB = accounts.find(a => a.login === 'developer-b');
    assert.ok(accA);
    assert.ok(accB);
    assert.equal(accA.isActive, false);
    assert.equal(accB.isActive, true);

    // 4. Chuyển đổi tài khoản (Switch Account)
    const switched = switchAccount(tmpDir, 'developer-a');
    assert.equal(switched, true);
    active = getActiveAccount(tmpDir);
    assert.equal(active.user.login, 'developer-a');
    assert.equal(active.token, 'token-alice-123');

    // 5. Xóa tài khoản active (Remove Account)
    removeAccount(tmpDir, 'developer-a');
    active = getActiveAccount(tmpDir);
    assert.equal(active.user.login, 'developer-b'); // Tự động fallback về tài khoản còn lại

    // 6. Xóa toàn bộ (Full Logout)
    clearAllAccounts(tmpDir);
    assert.equal(getActiveAccount(tmpDir), null);
    assert.deepEqual(listAccounts(tmpDir), []);
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }
});

