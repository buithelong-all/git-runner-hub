/**
 * GitRunnerHub Core - Runner Lifecycle & Management [GRH-120..131]
 */

const { Result } = require('./result');

// Checksum SHA256 chính thức từ GitHub Releases cho Actions Runner v2.338.0
const RUNNER_CHECKSUMS = {
  'linux-x64': 'af4b794c1bc41d73d40535e3fe092a39f9679cd8d965954c2aca25a05ca41d32',
  'linux-arm64': '3f5509f103b417e089d70c497ca261ec0a187123fae890c00078b660c6085a6a',
  'osx-arm64': 'a6e3557e2df283bc486adbc4ce42ec5304192b02787e9c3cf0c1ea354bbbe5ea',
  'osx-x64': 'e26a267926b487e4dbcb7b312781440d995c73562a149a4e39ec2f87c33ca8bf'
};

function getRunnerChecksum(platformType, arch) {
  const key = `${platformType === 'macos' ? 'osx' : 'linux'}-${arch}`;
  return RUNNER_CHECKSUMS[key] || null;
}

function getServiceUnitName(repoSlug) {
  return `actions.runner.buithelong-all-${repoSlug}.local-${repoSlug}.service`;
}

function parseRunnerList(apiJsonList, targetRepoSlug) {
  if (!Array.isArray(apiJsonList)) return [];

  return apiJsonList.map(r => ({
    id: r.id,
    name: r.name,
    status: r.status, // 'online' | 'offline'
    busy: !!r.busy,
    isTargetRepo: r.name ? r.name.includes(targetRepoSlug) : false
  }));
}

module.exports = {
  RUNNER_CHECKSUMS,
  getRunnerChecksum,
  getServiceUnitName,
  parseRunnerList
};
