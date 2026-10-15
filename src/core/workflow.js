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

function findRunsOnLines(yamlContent) {
  if (!yamlContent) return [];
  const lines = yamlContent.split('\n');
  const matches = [];
  lines.forEach((line, idx) => {
    const m = line.match(/^(\s*runs-on\s*:\s*)(.+)$/i);
    if (m) {
      matches.push({
        lineNumber: idx + 1,
        lineContent: line.trim(),
        target: m[2].trim(),
        isGithubHosted: /ubuntu-|windows-|macos-|latest/i.test(m[2])
      });
    }
  });
  return matches;
}

function findWorkflowDiff(originalYaml, patchedYaml) {
  if (!originalYaml || !patchedYaml) return [];
  if (originalYaml === patchedYaml) return [];

  const A = originalYaml.split('\n');
  const B = patchedYaml.split('\n');
  const m = A.length, n = B.length;

  const dp = Array.from({ length: m + 1 }, () => new Int32Array(n + 1));
  for (let i = 0; i < m; i++) {
    for (let j = 0; j < n; j++) {
      if (A[i] === B[j]) {
        dp[i + 1][j + 1] = dp[i][j] + 1;
      } else {
        dp[i + 1][j + 1] = Math.max(dp[i + 1][j], dp[i][j + 1]);
      }
    }
  }

  let i = m, j = n;
  const changes = [];
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && A[i - 1] === B[j - 1]) {
      i--;
      j--;
    } else if (i > 0 && j > 0 && dp[i - 1][j] === dp[i][j - 1]) {
      // Thay đổi tại cùng vị trí (modify)
      changes.unshift({
        type: 'modify',
        line: i,
        original: A[i - 1],
        patched: B[j - 1]
      });
      i--;
      j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      changes.unshift({
        type: 'add',
        line: j,
        original: '',
        patched: B[j - 1]
      });
      j--;
    } else {
      changes.unshift({
        type: 'delete',
        line: i,
        original: A[i - 1],
        patched: ''
      });
      i--;
    }
  }

  return changes;
}

function generateProposedPatch(yamlContent, customLabel, options = {}) {
  if (!yamlContent) return null;

  const targetRunsOn = customLabel 
    ? `[self-hosted, Linux, X64, ${customLabel}]`
    : `[self-hosted, Linux, X64]`;

  const lines = yamlContent.split('\n');
  const patchedLines = lines.map(line => {
    const m = line.match(/^(\s*runs-on\s*:\s*)(.+)$/i);
    if (m) {
      const currentTarget = m[2].trim();
      // Thay thế nếu đang dùng GitHub-hosted runners
      if (/ubuntu-|windows-|macos-|latest/i.test(currentTarget)) {
        return `${m[1]}${targetRunsOn}`;
      }
    }
    return line;
  });

  let patched = patchedLines.join('\n');

  // Mặc định bổ sung concurrency nếu là non-deploy workflow và chưa có (trừ khi options.injectConcurrency === false)
  const shouldInjectConcurrency = options.injectConcurrency !== false;
  if (shouldInjectConcurrency) {
    const isDeploy = /(deploy|release|publish|production)/i.test(yamlContent);
    if (!isDeploy && !/concurrency\s*:/i.test(patched)) {
      patched = patched.replace(/^on\s*:\s*([\s\S]*?)(jobs\s*:)/m, (match, onBlock, jobsBlock) => {
        const concurrencyBlock = `\nconcurrency:\n  group: ci-\${{ github.workflow }}-\${{ github.ref }}\n  cancel-in-progress: true\n\n`;
        return `on:${onBlock}${concurrencyBlock}${jobsBlock}`;
      });
    }
  }

  return patched;
}

function generateRepoLabel(repoFullName) {
  if (!repoFullName) return 'grh-local-runner';
  const nameOnly = repoFullName.includes('/') ? repoFullName.split('/')[1] : repoFullName;
  const clean = nameOnly.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `grh-${clean}`;
}

function detectPlatformLabels(platform, arch, customLabel = null) {
  const plat = (platform || process.platform).toLowerCase();
  const ar = (arch || process.arch).toLowerCase();

  let osLabel = 'Linux';
  if (plat.includes('darwin') || plat.includes('mac')) {
    osLabel = 'macOS';
  } else if (plat.includes('win')) {
    osLabel = 'Windows';
  }

  let archLabel = 'X64';
  if (ar.includes('arm64') || ar.includes('aarch64')) {
    archLabel = 'ARM64';
  } else if (ar.includes('arm')) {
    archLabel = 'ARM';
  }

  const labels = ['self-hosted', osLabel, archLabel];
  if (customLabel && typeof customLabel === 'string' && customLabel.trim()) {
    labels.push(customLabel.trim());
  }
  return labels;
}

function generateRollbackPatch(yamlContent, fallbackOs = 'ubuntu-latest') {
  if (!yamlContent) return null;

  const lines = yamlContent.split('\n');
  const rolledBackLines = lines.map(line => {
    const m = line.match(/^(\s*runs-on\s*:\s*)(.+)$/i);
    if (m) {
      const currentTarget = m[2].trim();
      // Nếu đang là self-hosted thì đưa về fallbackOs
      if (/self-hosted/i.test(currentTarget)) {
        return `${m[1]}${fallbackOs}`;
      }
    }
    return line;
  });

  return rolledBackLines.join('\n');
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

/**
 * Lấy danh sách toàn bộ workflows từ GitHub repo qua API, tự động phân tích và tạo bản vá Diff
 */
async function fetchRepoWorkflows(token, repoFullName, customLabel = '') {
  if (!repoFullName) return { success: false, error: 'Thiếu tên repository', workflows: [] };

  const headers = {
    'User-Agent': 'GitRunnerHub',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (token) {
    headers['Authorization'] = `Bearer ${token.trim()}`;
  }

  try {
    const listRes = await fetch(`https://api.github.com/repos/${repoFullName}/contents/.github/workflows`, { headers });
    
    if (listRes.status === 404) {
      return { success: true, workflows: [], message: 'Không tìm thấy thư mục .github/workflows' };
    }
    if (!listRes.ok) {
      return { success: false, error: `GitHub API HTTP ${listRes.status}`, workflows: [] };
    }

    const files = await listRes.json();
    if (!Array.isArray(files)) {
      return { success: true, workflows: [] };
    }

    const yamlFiles = files.filter(f => f.type === 'file' && (f.name.endsWith('.yml') || f.name.endsWith('.yaml')));
    const workflows = [];

    for (const file of yamlFiles) {
      try {
        const fileRes = await fetch(file.url, { headers });
        if (fileRes.ok) {
          const fileData = await fileRes.json();
          const rawYaml = Buffer.from(fileData.content, 'base64').toString('utf8');
          const runsOnMatches = findRunsOnLines(rawYaml);
          const inspectData = inspectWorkflow(rawYaml);
          const proposedPatch = generateProposedPatch(rawYaml, customLabel);
          const diffs = findWorkflowDiff(rawYaml, proposedPatch);
          const needsPatch = diffs.length > 0;

          workflows.push({
            name: file.name,
            path: file.path,
            sha: fileData.sha,
            downloadUrl: file.download_url,
            runsOnLines: runsOnMatches,
            routing: inspectData.routing,
            needsPatch,
            diffs,
            originalContent: rawYaml,
            patchedContent: proposedPatch
          });
        }
      } catch (e) {
        console.warn(`Lỗi đọc file ${file.name}:`, e.message);
      }
    }

    return { success: true, workflows };
  } catch (err) {
    return { success: false, error: err.message, workflows: [] };
  }
}

/**
 * 1-Click Commit bản vá trực tiếp lên GitHub repo
 */
async function commitWorkflowPatch(token, repoFullName, filePath, patchedContent, sha, branch = null, message = null) {
  if (!token) return { success: false, error: 'Chưa có token xác thực GitHub' };
  if (!repoFullName || !filePath || !patchedContent || !sha) {
    return { success: false, error: 'Thiếu thông số bắt buộc để commit' };
  }

  const commitMsg = message || `ci: route jobs to self-hosted runner via GitRunnerHub [1-click patch]`;
  const body = {
    message: commitMsg,
    content: Buffer.from(patchedContent, 'utf8').toString('base64'),
    sha
  };
  if (branch) {
    body.branch = branch;
  }

  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/contents/${filePath}`, {
      method: 'PUT',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'User-Agent': 'GitRunnerHub',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return { success: false, error: errData.message || `HTTP ${res.status}` };
    }

    const data = await res.json();
    return {
      success: true,
      commitSha: data.commit?.sha || null,
      commitUrl: data.commit?.html_url || null,
      contentSha: data.content?.sha || null
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Kích hoạt một workflow run mới qua GitHub API (workflow_dispatch)
 */
async function dispatchWorkflowRun(token, repoFullName, workflowIdOrFileName, ref = 'main') {
  if (!token) return { success: false, error: 'Chưa có GitHub Token' };
  if (!repoFullName || !workflowIdOrFileName) return { success: false, error: 'Thiếu thông số repo hoặc workflow' };

  try {
    const res = await fetch(`https://api.github.com/repos/${repoFullName}/actions/workflows/${workflowIdOrFileName}/dispatches`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'User-Agent': 'GitRunnerHub',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ ref })
    });

    if (res.status === 204) {
      return { success: true, message: 'Đã kích hoạt CI Run thành công!' };
    }

    const err = await res.json().catch(() => ({}));
    return { success: false, error: err.message || `HTTP ${res.status}` };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Lấy workflow run mới nhất và đối chiếu runner thực thi
 */
async function fetchLatestWorkflowRunAndVerify(token, repoFullName, intendedRunnerName) {
  if (!repoFullName) return { success: false, error: 'Thiếu repo name' };

  const headers = {
    'User-Agent': 'GitRunnerHub',
    'Accept': 'application/vnd.github.v3+json'
  };
  if (token) headers['Authorization'] = `Bearer ${token.trim()}`;

  try {
    const runsRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runs?per_page=1`, { headers });
    if (!runsRes.ok) return { success: false, error: `GitHub API runs HTTP ${runsRes.status}` };
    const runsData = await runsRes.json();
    const latestRun = (runsData.workflow_runs || [])[0];
    if (!latestRun) {
      return { success: true, hasRun: false, message: 'Chưa có workflow run nào' };
    }

    const jobsRes = await fetch(latestRun.jobs_url, { headers });
    let jobs = [];
    if (jobsRes.ok) {
      const jobsData = await jobsRes.json();
      jobs = jobsData.jobs || [];
    }

    const jobVerifications = jobs.map(j => ({
      id: j.id,
      name: j.name,
      status: j.status,
      conclusion: j.conclusion,
      runnerName: j.runner_name || null,
      verification: verifyRunExecution(j, intendedRunnerName || '')
    }));

    const isAnyVerified = jobVerifications.some(j => j.verification.verified);

    return {
      success: true,
      hasRun: true,
      runId: latestRun.id,
      name: latestRun.name,
      status: latestRun.status,
      conclusion: latestRun.conclusion,
      htmlUrl: latestRun.html_url,
      headSha: latestRun.head_sha,
      createdAt: latestRun.created_at,
      jobs: jobVerifications,
      isVerifiedOnLocalRunner: isAnyVerified
    };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

/**
 * Quét tóm tắt nhanh trạng thái workflow của 1 repo
 */
async function scanRepoWorkflowSummary(token, repoFullName) {
  const res = await fetchRepoWorkflows(token, repoFullName);
  if (!res.success || !res.workflows || res.workflows.length === 0) {
    return {
      repoFullName,
      hasWorkflows: false,
      routing: 'NO_CI',
      needsPatch: false,
      workflowsCount: 0,
      activeLabel: generateRepoLabel(repoFullName)
    };
  }

  const workflows = res.workflows;
  const anyNeedsPatch = workflows.some(w => w.needsPatch);
  const allSelfHosted = workflows.every(w => w.routing === 'SELF_HOSTED');
  const allGithubHosted = workflows.every(w => w.routing === 'GITHUB_HOSTED');

  let overallRouting = 'MIXED';
  if (allSelfHosted) overallRouting = 'SELF_HOSTED';
  else if (allGithubHosted) overallRouting = 'GITHUB_HOSTED';

  return {
    repoFullName,
    hasWorkflows: true,
    routing: overallRouting,
    needsPatch: anyNeedsPatch,
    workflowsCount: workflows.length,
    activeLabel: generateRepoLabel(repoFullName),
    workflows: workflows.map(w => ({
      name: w.name,
      path: w.path,
      routing: w.routing,
      needsPatch: w.needsPatch
    }))
  };
}

/**
 * Quét hàng loạt tất cả các repos với kiểm soát đồng thời (concurrency)
 */
async function batchScanWorkflows(token, repoList, onProgress = null) {
  const results = {};
  const queue = [...repoList];
  const CONCURRENCY = 4;

  async function worker() {
    while (queue.length > 0) {
      const repo = queue.shift();
      if (!repo) break;
      try {
        const summary = await scanRepoWorkflowSummary(token, repo);
        results[repo] = summary;
        if (onProgress) onProgress(repo, summary, Object.keys(results).length, repoList.length);
      } catch (err) {
        results[repo] = {
          repoFullName: repo,
          hasWorkflows: false,
          routing: 'ERROR',
          error: err.message
        };
      }
    }
  }

  const workers = Array.from({ length: Math.min(CONCURRENCY, repoList.length) }, () => worker());
  await Promise.all(workers);

  return results;
}

/**
 * 1-Click Sửa hàng loạt tất cả các repos sang Self-Hosted
 */
async function batchPatchWorkflows(token, repoList, onProgress = null) {
  const results = [];
  for (let i = 0; i < repoList.length; i++) {
    const repo = repoList[i];
    const wfRes = await fetchRepoWorkflows(token, repo);
    if (!wfRes.success || !wfRes.workflows) {
      results.push({ repo, success: false, error: wfRes.error || 'Không tải được workflow' });
      continue;
    }

    const customLabel = generateRepoLabel(repo);
    let patchedCount = 0;

    for (const wf of wfRes.workflows) {
      if (wf.needsPatch) {
        const patchRes = await commitWorkflowPatch(
          token,
          repo,
          wf.path,
          wf.patchedContent,
          wf.sha,
          null,
          `ci: route ${wf.name} to self-hosted runner via GitRunnerHub [1-click patch all]`
        );
        if (patchRes.success) patchedCount++;
      }
    }

    const itemResult = { repo, success: true, patchedCount };
    results.push(itemResult);
    if (onProgress) onProgress(repo, itemResult, i + 1, repoList.length);
  }
  return results;
}

/**
 * 1-Click Hoàn tác hàng loạt tất cả các repos về GitHub Actions (ubuntu-latest)
 */
async function batchRollbackWorkflows(token, repoList, onProgress = null) {
  const results = [];
  for (let i = 0; i < repoList.length; i++) {
    const repo = repoList[i];
    const wfRes = await fetchRepoWorkflows(token, repo);
    if (!wfRes.success || !wfRes.workflows) {
      results.push({ repo, success: false, error: wfRes.error || 'Không tải được workflow' });
      continue;
    }

    let rolledBackCount = 0;
    for (const wf of wfRes.workflows) {
      if (wf.routing === 'SELF_HOSTED' || wf.routing === 'MIXED') {
        const rolledBackContent = generateRollbackPatch(wf.originalContent);
        const rollbackRes = await commitWorkflowPatch(
          token,
          repo,
          wf.path,
          rolledBackContent,
          wf.sha,
          null,
          `ci: rollback ${wf.name} to ubuntu-latest via GitRunnerHub [1-click rollback all]`
        );
        if (rollbackRes.success) rolledBackCount++;
      }
    }

    const itemResult = { repo, success: true, rolledBackCount };
    results.push(itemResult);
    if (onProgress) onProgress(repo, itemResult, i + 1, repoList.length);
  }
  return results;
}

module.exports = {
  inspectWorkflow,
  findRunsOnLines,
  findWorkflowDiff,
  generateProposedPatch,
  generateRollbackPatch,
  generateRepoLabel,
  detectPlatformLabels,
  verifyRunExecution,
  fetchRepoWorkflows,
  commitWorkflowPatch,
  dispatchWorkflowRun,
  fetchLatestWorkflowRunAndVerify,
  scanRepoWorkflowSummary,
  batchScanWorkflows,
  batchPatchWorkflows,
  batchRollbackWorkflows
};


