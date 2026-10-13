/**
 * GitRunnerHub Core - Workflow Routing & Analysis [GRH-140..149]
 */

const { Result } = require('./result');

function inspectWorkflow(yamlContent) {
  if (!yamlContent || typeof yamlContent !== 'string') {
    return {
      routing: 'UNKNOWN',
      isDeployWorkflow: false,
      hasConcurrency: false,
      hasDuplicateTriggers: false,
      runsOn: []
    };
  }

  const lines = yamlContent.split('\n');
  const runsOnList = [];
  let isDeploy = false;
  let hasConcurrency = /concurrency\s*:/i.test(yamlContent);
  let hasPush = /^\s*push\s*:/m.test(yamlContent) || /on:\s*\[.*push.*\]/i.test(yamlContent);
  let hasPR = /^\s*pull_request\s*:/m.test(yamlContent) || /on:\s*\[.*pull_request.*\]/i.test(yamlContent);

  // Phát hiện workflow deploy/production
  if (/(deploy|release|publish|production|staging|publish-to)/i.test(yamlContent)) {
    isDeploy = true;
  }

  // Thu thập các chỉ định runs-on
  for (const line of lines) {
    const match = line.match(/runs-on\s*:\s*(.+)/i);
    if (match) {
      runsOnList.push(match[1].trim());
    }
  }

  let hasGithubHosted = false;
  let hasSelfHosted = false;

  runsOnList.forEach(r => {
    if (/ubuntu-|windows-|macos-|latest/i.test(r)) {
      hasGithubHosted = true;
    }
    if (/self-hosted/i.test(r)) {
      hasSelfHosted = true;
    }
  });

  let routing = 'UNKNOWN';
  if (hasGithubHosted && hasSelfHosted) {
    routing = 'MIXED';
  } else if (hasSelfHosted) {
    routing = 'SELF_HOSTED';
  } else if (hasGithubHosted) {
    routing = 'GITHUB_HOSTED';
  }

  return {
    routing,
    isDeployWorkflow: isDeploy,
    hasConcurrency,
    hasDuplicateTriggers: hasPush && hasPR,
    runsOn: runsOnList
  };
}

function generateProposedPatch(yamlContent, customLabel) {
  if (!yamlContent) return null;

  let patched = yamlContent;

  // 1. Chuyển runs-on github-hosted sang custom self-hosted
  patched = patched.replace(/runs-on\s*:\s*(\[.*?\]|ubuntu-latest|macos-latest|windows-latest|[a-zA-Z0-9_-]+)/g, () => {
    return `runs-on: [self-hosted, Linux, X64, ${customLabel}]`;
  });

  // 2. Bổ sung concurrency nếu là non-deploy workflow và chưa có
  const isDeploy = /(deploy|release|publish|production)/i.test(yamlContent);
  if (!isDeploy && !/concurrency\s*:/i.test(patched)) {
    patched = patched.replace(/^on\s*:\s*([\s\S]*?)(jobs\s*:)/m, (match, onBlock, jobsBlock) => {
      const concurrencyBlock = `\nconcurrency:\n  group: ci-\${{ github.workflow }}-\${{ github.ref }}\n  cancel-in-progress: true\n\n`;
      return `on:${onBlock}${concurrencyBlock}${jobsBlock}`;
    });
  }

  return patched;
}

function verifyRunExecution(jobDetail, intendedRunnerName) {
  if (!jobDetail) return { verified: false, reason: 'Không có dữ liệu job' };

  const actualRunner = jobDetail.runner_name || jobDetail.runnerName || null;
  if (!actualRunner) {
    return { verified: false, reason: 'Chưa có thông tin runner thực thi' };
  }

  const isMatch = actualRunner.toLowerCase().includes(intendedRunnerName.toLowerCase());
  return {
    verified: isMatch,
    actualRunner,
    intendedRunnerName,
    reason: isMatch ? 'Job đã thực thi chính xác trên runner mục tiêu' : `Job thực thi trên runner khác: ${actualRunner}`
  };
}

module.exports = {
  inspectWorkflow,
  generateProposedPatch,
  verifyRunExecution
};
