/**
 * GitRunnerHub Core - Platform & Architecture Detection [GRH-120]
 */

const os = require('os');
const fs = require('fs');

function getPlatformInfo() {
  const nodePlatform = os.platform(); // 'win32' | 'darwin' | 'linux'
  const nodeArch = os.arch();         // 'x64' | 'arm64'

  let type = 'unknown';
  let isWsl = false;

  if (nodePlatform === 'win32') {
    type = 'windows';
    isWsl = true; // GitRunnerHub relies on WSL2 on Windows
  } else if (nodePlatform === 'darwin') {
    type = 'macos';
  } else if (nodePlatform === 'linux') {
    type = 'linux';
    try {
      if (fs.existsSync('/proc/version')) {
        const procVer = fs.readFileSync('/proc/version', 'utf8').toLowerCase();
        if (procVer.includes('microsoft') || procVer.includes('wsl')) {
          isWsl = true;
        }
      }
    } catch (_) {}
  }

  // Map to GitHub Actions official runner architecture string
  let runnerArch = 'x64';
  if (nodeArch === 'arm64') {
    runnerArch = 'arm64';
  }

  return {
    os: nodePlatform,
    type,
    isWsl,
    arch: nodeArch,
    runnerArch,
    runnerTarName: type === 'macos' 
      ? `actions-runner-osx-${runnerArch}-2.338.0.tar.gz`
      : `actions-runner-linux-${runnerArch}-2.338.0.tar.gz`
  };
}

module.exports = {
  getPlatformInfo
};
