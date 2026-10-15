/**
 * GitRunnerHub Core - Repository Identification & Validation [GRH-111]
 */

const { Result } = require('./result');

const REPO_REGEX = /^[a-zA-Z0-9_.-]+\/[a-zA-Z0-9_.-]+$/;

function isValidRepo(identifier) {
  if (!identifier || typeof identifier !== 'string') return false;
  return REPO_REGEX.test(identifier.trim());
}

function parseRepoInput(input) {
  if (!input || typeof input !== 'string') {
    return Result.failure('ERR_INVALID_INPUT', 'Vui lòng cung cấp link hoặc tên repository hợp lệ.', 'Nhập dạng owner/repo hoặc URL https://github.com/owner/repo');
  }

  let str = input.trim();
  // Strip protocol & host
  str = str.replace(/^https?:\/\/github\.com\//i, '');
  str = str.replace(/^git@github\.com:/i, '');
  str = str.replace(/\.git$/i, '');
  str = str.replace(/\/+$/, '');

  if (!isValidRepo(str)) {
    return Result.failure(
      'ERR_REPO_FORMAT',
      `Định dạng repository không hợp lệ: "${input}"`,
      'Repository phải có dạng "owner/repo" (ví dụ: owner/my-repo).'
    );
  }

  const [owner, name] = str.split('/');
  return Result.success({
    fullName: str,
    owner,
    name,
    slug: `${owner}-${name}`.replace(/[^a-zA-Z0-9-_]/g, '-'),
    label: `${name}-local`.toLowerCase()
  });
}

module.exports = {
  isValidRepo,
  parseRepoInput
};
