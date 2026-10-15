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

module.exports = {
  inspectWorkflow,
  findRunsOnLines,
  findWorkflowDiff,
  generateProposedPatch,
  verifyRunExecution,
  fetchRepoWorkflows,
  commitWorkflowPatch
};


