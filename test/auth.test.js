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
