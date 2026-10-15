let allRepos = [];
let currentFilter = 'all';
let currentUser = null;
let currentDeviceCode = null;
let devicePollTimer = null;
let deviceVerificationUri = 'https://github.com/login/device';
let currentDiffMode = 'side-by-side'; // 'side-by-side' | 'unified'
let isTerminalOpen = false;
let isTerminalExpanded = false;
let repoWorkflowSummaries = {}; // Map lưu kết quả quét workflow thực tế: { [repo]: summary }

// Browser Web API Adapter (cho phép chạy mượt mà trên Chrome/Edge khi mở qua HTTP)
if (typeof window.gitRunnerAPI === 'undefined') {
  const logListeners = [];
  window.gitRunnerAPI = {
    getSystemInfo: async () => {
      try {
        const res = await fetch('/api/system-info');
        if (res.ok) return await res.json();
      } catch (e) {}
      return {
        platform: 'Web Preview (Windows / WSL2)',
        arch: 'x64',
        totalMem: '32.0',
        freeMem: '12.4',
        loggedIn: false,
        user: null
      };
    },
    getCurrentUser: async () => {
      try {
        const res = await fetch('/api/auth/current-user');
        if (res.ok) return await res.json();
      } catch (e) {}
      return { loggedIn: false, user: null };
    },
    loginWithToken: async (token) => {
      try {
        const res = await fetch('/api/auth/login-token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ token })
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    loginWithGhCli: async () => {
      try {
        const res = await fetch('/api/auth/login-gh', { method: 'POST' });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    startDeviceFlow: async () => {
      try {
        const res = await fetch('/api/auth/device-start', { method: 'POST' });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    pollDeviceFlow: async (deviceCode) => {
      try {
        const res = await fetch('/api/auth/device-poll', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ deviceCode })
        });
        return await res.json();
      } catch (e) {
        return { status: 'error', error: e.message };
      }
    },
    logout: async () => {
      try {
        const res = await fetch('/api/auth/logout', { method: 'POST' });
        return await res.json();
      } catch (e) {
        return { success: true };
      }
    },
    fetchRepos: async () => {
      try {
        const res = await fetch('/api/repos');
        if (res.ok) return await res.json();
      } catch (e) {}
      return {
        success: true,
        repos: [
          { nameWithOwner: 'buithelong-all/git-runner-hub', description: '1-Click GitHub Actions Self-Hosted Runner Manager', isPrivate: false, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/DanhTinh-Lab', description: 'Nền tảng kiểm định và tự động hóa hồ sơ danh tính', isPrivate: true, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/caevietnam.vn', description: 'Cổng thông tin chuyên ngành CAE & mô phỏng', isPrivate: false, updatedAt: new Date().toISOString() }
        ]
      };
    },
    getLocalRunners: async () => {
      try {
        const res = await fetch('/api/local-runners');
        if (res.ok) return await res.json();
      } catch (e) {}
      return ['DanhTinh-Lab', 'caevietnam.vn', 'git-runner-hub'];
    },
    checkRunnerStatus: async (repo) => {
      try {
        const res = await fetch('/api/runner/status?repo=' + encodeURIComponent(repo));
        if (res.ok) return await res.json();
      } catch (e) {}
      return { hasRunner: true, isOnline: true, runnerName: 'local-runner' };
    },
    setupRunner: async (repo) => {
      logListeners.forEach(cb => cb(`> [Web Sim] Đang gửi yêu cầu thiết lập runner cho ${repo}...\n`));
      return { success: true, exitCode: 0 };
    },
    lifecycleRunner: async (action, repoFullName) => {
      logListeners.forEach(cb => cb(`> [Web Sim] Thực hiện '${action}' cho ${repoFullName}...\n`));
      return { success: true, exitCode: 0 };
    },
    openExternal: (url) => {
      window.open(url, '_blank');
    },
    onLogUpdate: (callback) => {
      logListeners.push(callback);
    },
    fetchWorkflows: async (repo, label) => {
      try {
        const res = await fetch(`/api/workflows?repo=${encodeURIComponent(repo)}&label=${encodeURIComponent(label || '')}`);
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message, workflows: [] };
      }
    },
    getWorkflowSummary: async (repo) => {
      try {
        const res = await fetch(`/api/workflows/summary?repo=${encodeURIComponent(repo)}`);
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    batchScanWorkflows: async (repos) => {
      try {
        const res = await fetch('/api/workflows/batch-scan', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repos })
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    batchPatchWorkflows: async (repos) => {
      try {
        const res = await fetch('/api/workflows/batch-patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repos })
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    batchRollbackWorkflows: async (repos) => {
      try {
        const res = await fetch('/api/workflows/batch-rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ repos })
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    commitWorkflowPatch: async (params) => {
      try {
        const res = await fetch('/api/workflows/patch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    rollbackWorkflowPatch: async (params) => {
      try {
        const res = await fetch('/api/workflows/rollback', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    dispatchWorkflowRun: async (params) => {
      try {
        const res = await fetch('/api/workflows/dispatch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(params)
        });
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    },
    getLatestWorkflowRun: async ({ repoFullName, runnerName }) => {
      try {
        const res = await fetch(`/api/workflows/latest-run?repo=${encodeURIComponent(repoFullName)}&runner=${encodeURIComponent(runnerName || '')}`);
        return await res.json();
      } catch (e) {
        return { success: false, error: e.message };
      }
    }
  };
}

const isElectron = true;

// Quản lý trạng thái lưu trữ Local Storage
function getSavedActivatedRepos() {
  try {
    const raw = localStorage.getItem('git_runner_activated_repos');
    return raw ? JSON.parse(raw) : ['buithelong-all/git-runner-hub', 'buithelong-all/DanhTinh-Lab', 'buithelong-all/caevietnam.vn'];
  } catch (e) {
    return ['buithelong-all/git-runner-hub', 'buithelong-all/DanhTinh-Lab', 'buithelong-all/caevietnam.vn'];
  }
}

function saveActivatedRepo(repoName) {
  const cur = getSavedActivatedRepos();
  if (!cur.includes(repoName)) {
    cur.push(repoName);
    localStorage.setItem('git_runner_activated_repos', JSON.stringify(cur));
  }
}

// ==============================================================================
// INITIALIZATION & AUTH STATE
// ==============================================================================

async function init() {
  console.log('[Renderer] Initializing GitRunnerHub Cyber-Dark Batch Edition...');
  
  try {
    const sysInfo = await window.gitRunnerAPI.getSystemInfo();
    const statOsEl = document.getElementById('statOS');
    const statRamEl = document.getElementById('statRam');
    if (statOsEl) statOsEl.textContent = sysInfo.platform || 'Windows / WSL2';
    if (statRamEl) statRamEl.textContent = `${sysInfo.freeMem || '8.0'} GB rảnh`;
  } catch (e) {
    console.warn('System info error:', e);
  }

  // Realtime log
  window.gitRunnerAPI.onLogUpdate((logChunk) => {
    appendTerminalLog(logChunk);
  });

  await loadAccountProfile();
}

function appendTerminalLog(logChunk) {
  const term = document.getElementById('terminalLog');
  const modalTerm = document.getElementById('setupModalTerminalLog');
  const badge = document.getElementById('termModeBadge');

  if (term) {
    const formatted = logChunk.replace(/\n/g, '<br>');
    term.innerHTML += `<div class="term-line">${formatted}</div>`;
    term.scrollTop = term.scrollHeight;
  }
  if (modalTerm) {
    modalTerm.innerHTML += logChunk.replace(/\n/g, '<br>');
    modalTerm.scrollTop = modalTerm.scrollHeight;
  }
  if (badge) {
    badge.textContent = 'Streaming Log';
    badge.className = 'terminal-mode-badge streaming';
  }
}

async function loadAccountProfile() {
  try {
    const authStatus = await window.gitRunnerAPI.getCurrentUser();
    const avatarEl = document.getElementById('accountAvatar');
    const nameEl = document.getElementById('accountName');
    const handleEl = document.getElementById('accountHandle');
    const actionsEl = document.getElementById('accountActions');
    const promptEl = document.getElementById('accountLoginPrompt');

    if (authStatus && authStatus.loggedIn && authStatus.user) {
      currentUser = authStatus.user;
      if (nameEl) nameEl.textContent = currentUser.name || currentUser.login;
      if (handleEl) handleEl.textContent = `@${currentUser.login}`;

      if (avatarEl) {
        if (currentUser.avatarUrl) {
          avatarEl.innerHTML = `<img src="${currentUser.avatarUrl}" alt="${currentUser.login}" />`;
        } else {
          avatarEl.textContent = currentUser.login.charAt(0).toUpperCase();
        }
      }

      if (actionsEl) actionsEl.style.display = 'flex';
      if (promptEl) promptEl.style.display = 'none';

      await refreshRepos();
    } else {
      currentUser = null;
      if (avatarEl) avatarEl.innerHTML = '?';
      if (nameEl) nameEl.textContent = 'Chưa đăng nhập';
      if (handleEl) handleEl.textContent = 'Bấm kết nối tài khoản';
      if (actionsEl) actionsEl.style.display = 'none';
      if (promptEl) promptEl.style.display = 'block';

      allRepos = [];
      repoWorkflowSummaries = {};
      updateStats();
      renderEmptyLoginState();
    }
  } catch (err) {
    console.warn('Load account profile error:', err);
  }
}

function renderEmptyLoginState() {
  const grid = document.getElementById('reposGrid');
  if (!grid) return;
  grid.innerHTML = `
    <div style="grid-column: 1/-1; padding: 60px 20px; text-align: center; color: var(--muted); display: flex; flex-direction: column; align-items: center; gap: 14px;">
      <div style="font-size: 36px;">🔒</div>
      <h3 style="color: var(--text); font-size: 18px;">Chưa kết nối tài khoản GitHub</h3>
      <p style="max-width: 440px; font-size: 13px; color: var(--dim); line-height: 1.5;">
        Đăng nhập GitHub để GitRunnerHub tự động nạp repository, phát hiện file workflow CI và gắn runner an toàn.
      </p>
      <button class="btn-primary-action" onclick="openLoginModal()" style="margin-top: 8px;">
        <span>🔑</span> Kết nối ngay
      </button>
    </div>
  `;
}

// ==============================================================================
// LOGIN MODAL & AUTH FLOWS
// ==============================================================================

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const errorMsg = document.getElementById('authErrorMsg');
  if (errorMsg) {
    errorMsg.style.display = 'none';
    errorMsg.textContent = '';
  }
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function switchAuthTab(tabId, btn) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-tab-content').forEach(c => c.style.display = 'none');
  if (btn) btn.classList.add('active');

  const errorMsg = document.getElementById('authErrorMsg');
  if (errorMsg) errorMsg.style.display = 'none';

  if (tabId === 'token') {
    const el = document.getElementById('tabToken');
    if (el) el.style.display = 'flex';
  } else if (tabId === 'gh-cli') {
    const el = document.getElementById('tabGhCli');
    if (el) el.style.display = 'flex';
  }
}

async function handlePatLogin() {
  const input = document.getElementById('patInput');
  const token = input ? input.value.trim() : '';
  const errorMsg = document.getElementById('authErrorMsg');

  if (!token) {
    if (errorMsg) {
      errorMsg.textContent = 'Vui lòng dán mã Personal Access Token (ghp_...)';
      errorMsg.style.display = 'block';
    }
    return;
  }

  if (errorMsg) errorMsg.style.display = 'none';
  const res = await window.gitRunnerAPI.loginWithToken(token);
  if (res.success) {
    closeLoginModal();
    if (input) input.value = '';
    await loadAccountProfile();
  } else {
    if (errorMsg) {
      errorMsg.textContent = res.error || 'Token không hợp lệ hoặc thiếu quyền repo / workflow';
      errorMsg.style.display = 'block';
    }
  }
}

async function handleGhCliImport() {
  const errorMsg = document.getElementById('authErrorMsg');
  if (errorMsg) errorMsg.style.display = 'none';

  const res = await window.gitRunnerAPI.loginWithGhCli();
  if (res.success) {
    closeLoginModal();
    await loadAccountProfile();
  } else {
    if (errorMsg) {
      errorMsg.textContent = res.error || 'Không tìm thấy phiên đăng nhập GitHub CLI hợp lệ';
      errorMsg.style.display = 'block';
    }
  }
}

async function handleLogout() {
  if (!confirm('Bạn có chắc chắn muốn đăng xuất tài khoản GitHub hiện tại?')) return;
  await window.gitRunnerAPI.logout();
  await loadAccountProfile();
}

// ==============================================================================
// REPOSITORIES REFRESH, WORKFLOW ACCURACY & BATCH OPERATIONS
// ==============================================================================

async function refreshRepos() {
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  if (icon) icon.classList.add('spinning');
  if (text) text.textContent = 'Đang quét...';

  const savedActive = getSavedActivatedRepos();
  let localDirs = [];
  try {
    localDirs = await window.gitRunnerAPI.getLocalRunners();
  } catch (e) {}

  const res = await window.gitRunnerAPI.fetchRepos();
  if (icon) icon.classList.remove('spinning');
  if (text) text.textContent = 'Đồng bộ';

  if (res.success && res.repos) {
    allRepos = res.repos.map(r => {
      const repoSlug = r.nameWithOwner.replace('/', '-');
      const repoShort = r.nameWithOwner.split('/')[1];

      const isLocallyActive = savedActive.includes(r.nameWithOwner) || 
                              localDirs.some(d => d.includes(repoShort) || d.includes(repoSlug));

      return {
        name: r.nameWithOwner,
        desc: r.description || 'Chưa có mô tả cho dự án.',
        isPrivate: r.isPrivate,
        updated: formatDate(r.updatedAt),
        runnerOnline: isLocallyActive,
        runnerName: isLocallyActive ? (r.nameWithOwner.includes('caevietnam.vn') ? 'long-local-ci' : `local-${repoSlug}`) : null,
        routingStatus: 'Checking...',
        verifiedRuns: isLocallyActive ? 1 : 0
      };
    });

    handleSearch();
    updateStats();

    // 1. Quét trạng thái workflow thực tế ngay lập tức cho các repo ưu tiên (đặc biệt DanhTinh-Lab, git-runner-hub, caevietnam.vn)
    const priorityRepos = allRepos.slice(0, 8);
    priorityRepos.forEach(repo => {
      fetchAndApplyWorkflowSummary(repo.name);
    });

    // 2. Đối soát online status bất đồng bộ
    allRepos.forEach(repo => {
      if (repo.runnerOnline) {
        window.gitRunnerAPI.checkRunnerStatus(repo.name).then(status => {
          if (status.isOnline) {
            repo.runnerOnline = true;
            if (status.runnerName) repo.runnerName = status.runnerName;
            updateStats();
            handleSearch();
          }
        });
      }
    });

  } else {
    console.warn('Lỗi nạp repos:', res.error);
  }
}

async function fetchAndApplyWorkflowSummary(repoName) {
  try {
    const res = await window.gitRunnerAPI.getWorkflowSummary(repoName);
    if (res.success && res.summary) {
      repoWorkflowSummaries[repoName] = res.summary;
      const target = allRepos.find(r => r.name === repoName);
      if (target) {
        target.routingStatus = res.summary.routing;
        target.needsPatch = res.summary.needsPatch;
      }
      updateStats();
      handleSearch();
    }
  } catch (e) {
    console.warn('Lỗi lấy summary cho ' + repoName, e);
  }
}

// BATCH ACTION 1: Quét toàn bộ 43 repositories
async function handleBatchScanAll() {
  const btn = document.getElementById('btnBatchScan');
  const icon = document.getElementById('batchScanIcon');
  const statusText = document.getElementById('batchStatusText');

  if (btn) btn.disabled = true;
  if (icon) icon.className = 'spinning';
  if (statusText) statusText.textContent = `Đang quét tất cả ${allRepos.length} repositories từ GitHub API...`;

  openTerminalDrawer();
  appendTerminalLog(`> [Batch Scan] Bắt đầu quét workflow của ${allRepos.length} repositories...`);

  const repoNames = allRepos.map(r => r.name);
  const res = await window.gitRunnerAPI.batchScanWorkflows(repoNames);

  if (btn) btn.disabled = false;
  if (icon) icon.className = '';

  if (res.success && res.summaries) {
    repoWorkflowSummaries = { ...repoWorkflowSummaries, ...res.summaries };
    allRepos.forEach(r => {
      const summary = res.summaries[r.name];
      if (summary) {
        r.routingStatus = summary.routing;
        r.needsPatch = summary.needsPatch;
      }
    });

    const selfHostedCount = Object.values(res.summaries).filter(s => s.routing === 'SELF_HOSTED').length;
    const githubHostedCount = Object.values(res.summaries).filter(s => s.routing === 'GITHUB_HOSTED' || s.routing === 'MIXED').length;
    const noCiCount = Object.values(res.summaries).filter(s => s.routing === 'NO_CI').length;

    if (statusText) {
      statusText.innerHTML = `✅ Đã quét xong: <b style="color:#34d399;">${selfHostedCount} Self-Hosted</b> · <b style="color:#fbbf24;">${githubHostedCount} Cần sửa</b> · <b style="color:var(--dim);">${noCiCount} Chưa có CI</b>`;
    }

    appendTerminalLog(`> [Batch Scan] Hoàn tất! Phát hiện ${githubHostedCount} repo cần sửa sang Self-Hosted.`);
    updateStats();
    handleSearch();
  } else {
    if (statusText) statusText.textContent = `❌ Lỗi khi quét: ${res.error || 'Kiểm tra token'}`;
    appendTerminalLog(`> [Batch Scan] ❌ Lỗi: ${res.error}`);
  }
}

// BATCH ACTION 2: 1-Click Sửa hết sang Self-Hosted
async function handleBatchPatchAll() {
  const reposToPatch = allRepos.filter(r => {
    const summary = repoWorkflowSummaries[r.name];
    return summary ? summary.needsPatch : true; // Mặc định nếu chưa quét thì patch
  }).map(r => r.name);

  if (reposToPatch.length === 0) {
    alert('Tất cả các repository đã trỏ về Self-Hosted runner rồi! Không cần sửa thêm.');
    return;
  }

  if (!confirm(`Bạn có chắc chắn muốn 1-Click TỰ ĐỘNG SỬA ${reposToPatch.length} repositories sang Self-Hosted Runner?\n(Các file workflow sẽ được commit với [self-hosted, Linux, X64, grh-<repo>])`)) {
    return;
  }

  const btn = document.getElementById('btnBatchPatch');
  const statusText = document.getElementById('batchStatusText');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinning">🔄</span> Đang sửa hàng loạt...`;
  }
  if (statusText) statusText.textContent = `Đang 1-Click sửa ${reposToPatch.length} repositories...`;

  openTerminalDrawer();
  appendTerminalLog(`> [Batch Patch] Bắt đầu commit sửa workflow cho ${reposToPatch.length} repositories...`);

  const res = await window.gitRunnerAPI.batchPatchWorkflows(reposToPatch);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<span>🚀</span> Sửa hết sang Self-Hosted`;
  }

  if (res.success) {
    appendTerminalLog(`> ✅ [Batch Patch] Đã hoàn tất sửa hàng loạt!`);
    if (statusText) statusText.innerHTML = `🎉 Đã 1-Click sửa xong toàn bộ repositories!`;
    await handleBatchScanAll(); // Quét lại để cập nhật trạng thái ngay
  } else {
    appendTerminalLog(`> ❌ [Batch Patch] Lỗi: ${res.error}`);
    alert('Lỗi: ' + res.error);
  }
}

// BATCH ACTION 3: 1-Click Hoàn tác tất cả về GitHub Actions (ubuntu-latest)
async function handleBatchRollbackAll() {
  const reposToRollback = allRepos.map(r => r.name);

  if (!confirm(`Bạn có chắc chắn muốn 1-Click HOÀN TÁC TẤT CẢ các file workflow trở lại chạy trên GitHub Actions (ubuntu-latest)?`)) {
    return;
  }

  const btn = document.getElementById('btnBatchRollback');
  const statusText = document.getElementById('batchStatusText');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinning">🔄</span> Đang hoàn tác...`;
  }
  if (statusText) statusText.textContent = `Đang hoàn tác toàn bộ workflows về ubuntu-latest...`;

  openTerminalDrawer();
  appendTerminalLog(`> [Batch Rollback] Bắt đầu rollback tất cả file workflow về ubuntu-latest...`);

  const res = await window.gitRunnerAPI.batchRollbackWorkflows(reposToRollback);

  if (btn) {
    btn.disabled = false;
    btn.innerHTML = `<span>↩️</span> Sửa lại về GitHub Action`;
  }

  if (res.success) {
    appendTerminalLog(`> ↩️ [Batch Rollback] Đã hoàn tác tất cả file workflow về ubuntu-latest thành công!`);
    if (statusText) statusText.innerHTML = `↩️ Đã hoàn tác toàn bộ workflows về GitHub Actions!`;
    await handleBatchScanAll();
  } else {
    appendTerminalLog(`> ❌ [Batch Rollback] Lỗi: ${res.error}`);
    alert('Lỗi rollback: ' + res.error);
  }
}

// Sửa nhanh 1 repo ngay từ card (không cần mở modal)
async function quickPatchSingleRepo(repoName) {
  openTerminalDrawer();
  appendTerminalLog(`> [Quick Patch] Đang quét và sửa workflow cho ${repoName}...`);

  const wfRes = await window.gitRunnerAPI.fetchWorkflows(repoName);
  if (!wfRes.success || !wfRes.workflows || wfRes.workflows.length === 0) {
    alert(`Không tìm thấy file workflow nào trong ${repoName}`);
    return;
  }

  const label = wfRes.suggestedLabel || (repoName.includes('/') ? `grh-${repoName.split('/')[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'grh-local-runner');
  let patchedCount = 0;

  for (const wf of wfRes.workflows) {
    if (wf.needsPatch) {
      const commitRes = await window.gitRunnerAPI.commitWorkflowPatch({
        repoFullName: repoName,
        filePath: wf.path,
        patchedContent: wf.patchedContent,
        sha: wf.sha,
        message: `ci: route ${wf.name} to self-hosted runner [1-click quick patch]`
      });
      if (commitRes.success) patchedCount++;
    }
  }

  appendTerminalLog(`> ✅ [Quick Patch] Đã sửa xong ${patchedCount} workflow cho ${repoName}!`);
  await fetchAndApplyWorkflowSummary(repoName);
}

// Rollback nhanh 1 repo ngay từ card
async function quickRollbackSingleRepo(repoName) {
  if (!confirm(`Bạn có muốn hoàn tác các workflow của '${repoName}' trở lại chạy trên ubuntu-latest?`)) return;

  openTerminalDrawer();
  appendTerminalLog(`> [Quick Rollback] Đang hoàn tác workflow cho ${repoName}...`);

  const wfRes = await window.gitRunnerAPI.fetchWorkflows(repoName);
  if (!wfRes.success || !wfRes.workflows) {
    alert('Không tải được workflow của repo');
    return;
  }

  let rolledBackCount = 0;
  for (const wf of wfRes.workflows) {
    if (wf.routing === 'SELF_HOSTED' || wf.routing === 'MIXED') {
      const res = await window.gitRunnerAPI.rollbackWorkflowPatch({
        repoFullName: repoName,
        filePath: wf.path,
        originalContent: wf.originalContent,
        sha: wf.sha
      });
      if (res.success) rolledBackCount++;
    }
  }

  appendTerminalLog(`> ↩️ [Quick Rollback] Đã hoàn tác ${rolledBackCount} workflow cho ${repoName} về ubuntu-latest!`);
  await fetchAndApplyWorkflowSummary(repoName);
}

function updateStats() {
  const totalReposEl = document.getElementById('statTotalRepos');
  const onlineRunnersEl = document.getElementById('statOnlineRunners');
  const warningCountEl = document.getElementById('statWarningCount');
  const verifiedRunsEl = document.getElementById('statVerifiedRuns');

  const onlineCount = allRepos.filter(r => r.runnerOnline).length;
  
  // Tính chính xác số lượng Warnings / Mismatch dựa vào dữ liệu quét thực tế
  let mismatchCount = 0;
  allRepos.forEach(r => {
    const summary = repoWorkflowSummaries[r.name];
    if (summary) {
      if (summary.routing === 'GITHUB_HOSTED' || summary.routing === 'MIXED' || summary.needsPatch) {
        mismatchCount++;
      }
    } else {
      if (!r.runnerOnline) mismatchCount++;
    }
  });

  const verifiedCount = allRepos.filter(r => {
    const summary = repoWorkflowSummaries[r.name];
    return (summary && summary.routing === 'SELF_HOSTED') || r.verifiedRuns > 0;
  }).length;

  if (totalReposEl) totalReposEl.textContent = allRepos.length < 10 ? `0${allRepos.length}` : allRepos.length;
  if (onlineRunnersEl) onlineRunnersEl.textContent = onlineCount < 10 ? `0${onlineCount}` : onlineCount;
  if (warningCountEl) warningCountEl.textContent = mismatchCount < 10 ? `0${mismatchCount}` : mismatchCount;
  if (verifiedRunsEl) verifiedRunsEl.textContent = verifiedCount > 0 ? (verifiedCount < 10 ? `0${verifiedCount}` : verifiedCount) : '—';

  // Cập nhật số đếm trên filter tabs
  const countAll = document.getElementById('countAll');
  const countOnline = document.getElementById('countOnline');
  const countMismatch = document.getElementById('countMismatch');
  const countUnconfigured = document.getElementById('countUnconfigured');

  if (countAll) countAll.textContent = allRepos.length;
  if (countOnline) countOnline.textContent = onlineCount;
  if (countMismatch) countMismatch.textContent = mismatchCount;
  if (countUnconfigured) countUnconfigured.textContent = allRepos.length - onlineCount;
}

function setFilter(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.filter-tab').forEach(b => {
    if (b.getAttribute('data-filter') === type) {
      b.classList.add('active');
    } else {
      b.classList.remove('active');
    }
  });
  handleSearch();
}

function clearSearch() {
  const searchInput = document.getElementById('searchInput');
  if (searchInput) {
    searchInput.value = '';
    handleSearch();
  }
}

function handleSearch() {
  const searchInput = document.getElementById('searchInput');
  const clearBtn = document.getElementById('clearSearchBtn');
  const query = searchInput ? searchInput.value.toLowerCase().trim() : '';

  if (clearBtn) {
    clearBtn.style.display = query ? 'inline-block' : 'none';
  }

  let filtered = allRepos;

  if (currentFilter === 'online') {
    filtered = filtered.filter(r => r.runnerOnline);
  } else if (currentFilter === 'mismatch') {
    filtered = filtered.filter(r => {
      const summary = repoWorkflowSummaries[r.name];
      if (summary) return summary.routing === 'GITHUB_HOSTED' || summary.routing === 'MIXED' || summary.needsPatch;
      return !r.runnerOnline;
    });
  } else if (currentFilter === 'unconfigured') {
    filtered = filtered.filter(r => !r.runnerOnline);
  }

  if (query) {
    filtered = filtered.filter(r => r.name.toLowerCase().includes(query) || r.desc.toLowerCase().includes(query));
  }

  renderRepos(filtered);
}

function renderRepos(repos) {
  const grid = document.getElementById('reposGrid');
  if (!grid) return;
  grid.innerHTML = '';

  if (repos.length === 0) {
    grid.innerHTML = `
      <div class="grid-loading-placeholder">
        <p>Không tìm thấy repository nào phù hợp với bộ lọc hiện tại.</p>
      </div>
    `;
    return;
  }

  repos.forEach(repo => {
    const card = document.createElement('div');
    card.className = `repo-card ${repo.runnerOnline ? 'active-runner' : ''}`;

    // ĐỐI SOÁT TRẠNG THÁI THỰC TẾ TỪ GITHUB
    const summary = repoWorkflowSummaries[repo.name];
    let ciBadgeHtml = '';
    let quickActionBtnHtml = '';

    if (summary) {
      if (summary.routing === 'SELF_HOSTED') {
        ciBadgeHtml = `<span class="badge-ci-status self-hosted">🟢 Self-Hosted (${summary.activeLabel})</span>`;
        quickActionBtnHtml = `
          <button class="btn-action-sm btn-quick-rollback" onclick="quickRollbackSingleRepo('${repo.name}')" title="1-Click hoàn tác workflow quay lại ubuntu-latest">
            <span>↩️</span> Về GitHub Actions
          </button>
        `;
      } else if (summary.routing === 'GITHUB_HOSTED' || summary.routing === 'MIXED') {
        ciBadgeHtml = `<span class="badge-ci-status github-hosted">⚠️ Dùng ubuntu-latest</span>`;
        quickActionBtnHtml = `
          <button class="btn-action-sm btn-quick-patch" onclick="quickPatchSingleRepo('${repo.name}')" title="1-Click sửa sang [self-hosted, Linux, X64, ${summary.activeLabel}]">
            <span>🚀</span> Sửa sang Self-Hosted
          </button>
        `;
      } else {
        ciBadgeHtml = `<span class="badge-ci-status no-ci">⚪ Chưa có CI</span>`;
      }
    } else {
      // Khi chưa quét tóm tắt
      if (repo.runnerOnline) {
        ciBadgeHtml = `<span class="badge-ci-status self-hosted">🟢 Local Ready</span>`;
        quickActionBtnHtml = `
          <button class="btn-action-sm btn-quick-patch" onclick="quickPatchSingleRepo('${repo.name}')" title="Sửa sang Self-Hosted">
            <span>🚀</span> Sửa sang Self-Hosted
          </button>
        `;
      } else {
        ciBadgeHtml = `<span class="badge-ci-status github-hosted">⚠️ Cần kiểm tra</span>`;
      }
    }

    const statusBadge = repo.runnerOnline 
      ? `<span class="badge-status online"><span class="pulse-dot"></span> Runner Online</span>`
      : `<span class="badge-status offline">Chưa kích hoạt</span>`;

    const privacyBadge = repo.isPrivate
      ? `<span class="badge-tag private">🔒 Private</span>`
      : `<span class="badge-tag public">🌐 Public</span>`;

    const actionButtons = repo.runnerOnline
      ? `
        ${quickActionBtnHtml}
        <button class="btn-action-sm btn-patch-cta" onclick="openWorkflowModal('${repo.name}')" title="So sánh chi tiết Diff YAML">
          <span>🛠️</span> Diff
        </button>
        <button class="btn-action-sm btn-test-run" onclick="openWorkflowModal('${repo.name}')" title="Test CI Run trực tiếp để kiểm chứng">
          <span>▶️</span> Test CI Run
        </button>
        <button class="btn-icon-tiny" onclick="openRepoActions('${repo.name}')" title="Mở trang GitHub Actions trên trình duyệt">
          🚀
        </button>
        <button class="btn-icon-tiny" onclick="lifecycleAction('restart', '${repo.name}')" title="Khởi động lại Runner Service">
          🔄
        </button>
        <button class="btn-icon-tiny btn-icon-danger" onclick="lifecycleAction('detach', '${repo.name}')" title="Hủy và gỡ bỏ Runner này">
          🗑️
        </button>
      `
      : `
        ${quickActionBtnHtml}
        <button class="btn-action-sm btn-patch-cta" onclick="openWorkflowModal('${repo.name}')" title="Xem trước diff workflow">
          <span>🛠️</span> Diff
        </button>
        <button class="btn-action-sm btn-activate-cta" onclick="startSetup('${repo.name}')">
          <span>⚡</span> Kích hoạt Runner
        </button>
      `;

    card.innerHTML = `
      <div>
        <div class="card-header-row">
          <div class="repo-title-wrapper">
            <span class="repo-name-text" title="${repo.name}">
              ${repo.name}
            </span>
            <div class="repo-badges-row">
              ${privacyBadge}
              ${ciBadgeHtml}
            </div>
          </div>
          ${statusBadge}
        </div>

        <div class="repo-desc-text">${escapeHtml(repo.desc)}</div>
      </div>

      <div class="card-footer">
        <div class="card-meta-line">
          <span>📅 ${repo.updated}</span>
          ${repo.runnerOnline ? `<span style="color:#34d399;">⚡ ${repo.runnerName || 'Sẵn sàng'}</span>` : '<span style="color:var(--dim);">Local Runner</span>'}
        </div>
        <div class="card-action-toolbar">
          ${actionButtons}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function handleScanUrl() {
  const input = document.getElementById('repoUrlInput');
  const val = input ? input.value.trim() : '';
  if (!val) {
    alert('Vui lòng dán link GitHub Repository (ví dụ: https://github.com/buithelong-all/DanhTinh-Lab)');
    return;
  }

  let repoName = val.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').trim();
  if (!repoName.includes('/')) {
    alert('Định dạng link GitHub không hợp lệ. Ví dụ đúng: buithelong-all/DanhTinh-Lab');
    return;
  }

  startSetup(repoName);
}

// ==============================================================================
// RUNNER LIFECYCLE & SETUP LOGIC
// ==============================================================================

async function lifecycleAction(action, repoName) {
  if (action === 'detach') {
    if (!confirm(`Bạn có chắc chắn muốn HỦY và GỠ BỎ Local Runner cho '${repoName}'?`)) return;
  }

  openTerminalDrawer();
  appendTerminalLog(`> [Lifecycle] Bắt đầu thực thi lệnh '${action}' cho ${repoName}...`);

  const res = await window.gitRunnerAPI.lifecycleRunner(action, repoName);
  if (res.success) {
    appendTerminalLog(`> ✅ Lệnh '${action}' đã hoàn tất thành công!`);
    if (action === 'detach') {
      const saved = getSavedActivatedRepos().filter(r => r !== repoName);
      localStorage.setItem('git_runner_activated_repos', JSON.stringify(saved));
      const target = allRepos.find(r => r.name === repoName);
      if (target) {
        target.runnerOnline = false;
        target.runnerName = null;
      }
      updateStats();
      handleSearch();
    }
  } else {
    appendTerminalLog(`> ❌ Lỗi thực hiện lệnh '${action}' (mã: ${res.exitCode})`);
  }
}

async function startSetup(repoName) {
  openTerminalDrawer();
  appendTerminalLog(`> [GitRunnerHub] Bắt đầu thiết lập Local Runner cho ${repoName}...`);

  const modal = document.getElementById('setupModal');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');
  const closeBtn = document.getElementById('modalCloseBtn');
  
  if (title) title.textContent = `Kích hoạt Runner cho: ${repoName}`;
  if (desc) desc.textContent = `Đang tải runner package và cấu hình service chạy ngầm...`;
  if (closeBtn) {
    closeBtn.disabled = true;
    closeBtn.textContent = 'Đang xử lý...';
  }
  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  const res = await window.gitRunnerAPI.setupRunner(repoName);
  if (res.success) {
    appendTerminalLog(`> ✅ HOÀN TẤT THÀNH CÔNG! Runner đã ONLINE và sẵn sàng nhận job.`);
    saveActivatedRepo(repoName);
    const target = allRepos.find(r => r.name === repoName);
    if (target) {
      target.runnerOnline = true;
      target.runnerName = `local-${repoName.replace('/', '-')}`;
    }
    await fetchAndApplyWorkflowSummary(repoName);
    updateStats();
    handleSearch();
  } else {
    appendTerminalLog(`> ❌ Thất bại với mã thoát: ${res.exitCode}. Vui lòng kiểm tra log!`);
  }

  if (closeBtn) {
    closeBtn.disabled = false;
    closeBtn.textContent = 'Đóng & Hoàn tất';
  }
}

function closeModal() {
  const modal = document.getElementById('setupModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
}

function openRepoActions(repoName) {
  const url = `https://github.com/${repoName}/actions`;
  window.gitRunnerAPI.openExternal(url);
}

function formatDate(isoStr) {
  if (!isoStr) return 'Gần đây';
  try {
    const d = new Date(isoStr);
    return `${d.getDate()}/${d.getMonth() + 1}/${d.getFullYear()}`;
  } catch (e) {
    return 'Gần đây';
  }
}

// ==============================================================================
// BOTTOM DOCKED LIVE TERMINAL DRAWER LOGIC
// ==============================================================================

function toggleTerminalDrawer() {
  const drawer = document.getElementById('terminalDrawer');
  if (!drawer) return;
  isTerminalOpen = !isTerminalOpen;
  if (isTerminalOpen) {
    drawer.classList.add('open');
  } else {
    drawer.classList.remove('open', 'expanded');
    isTerminalExpanded = false;
  }
}

function openTerminalDrawer() {
  const drawer = document.getElementById('terminalDrawer');
  if (!drawer) return;
  isTerminalOpen = true;
  drawer.classList.add('open');
}

function expandTerminalDrawer() {
  const drawer = document.getElementById('terminalDrawer');
  const btn = document.getElementById('btnExpandTerm');
  if (!drawer) return;
  isTerminalExpanded = !isTerminalExpanded;
  if (isTerminalExpanded) {
    drawer.classList.add('expanded');
    if (btn) btn.textContent = '⤡';
  } else {
    drawer.classList.remove('expanded');
    if (btn) btn.textContent = '⤢';
  }
}

function clearTerminalLogs() {
  const term = document.getElementById('terminalLog');
  const badge = document.getElementById('termModeBadge');
  if (term) term.innerHTML = `<div class="term-line welcome">> Log cleared. Daemon idle.</div>`;
  if (badge) {
    badge.textContent = 'Daemon Idle';
    badge.className = 'terminal-mode-badge';
  }
}

// ==============================================================================
// WORKFLOW INSPECTOR & SIDE-BY-SIDE / UNIFIED VISUAL DIFF
// ==============================================================================

let currentModalRepo = null;
let currentModalWorkflows = [];

function openWorkflowModal(repoName) {
  currentModalRepo = repoName;
  const modal = document.getElementById('workflowModal');
  const title = document.getElementById('wfModalRepoTitle');
  const subtitle = document.getElementById('wfModalRepoSubtitle');
  const body = document.getElementById('wfModalBody');

  if (title) title.textContent = `🛠️ Gắn Runner & Sửa CI Workflow cho ${repoName}`;
  if (subtitle) subtitle.innerHTML = `Phát hiện dòng <code>runs-on: ubuntu-latest</code> và 1-Click sửa sang Self-Hosted`;
  if (body) {
    body.innerHTML = `
      <div class="grid-loading-placeholder">
        <span class="spinning">🔄</span>
        <div>Đang quét các file workflow trong <code>.github/workflows</code> của repo...</div>
      </div>
    `;
  }

  if (modal) {
    modal.style.display = 'flex';
    modal.classList.add('active');
  }

  loadRepoWorkflows(repoName);
}

function closeWorkflowModal() {
  const modal = document.getElementById('workflowModal');
  if (modal) {
    modal.style.display = 'none';
    modal.classList.remove('active');
  }
  currentModalRepo = null;
  currentModalWorkflows = [];
}

function switchDiffMode(mode) {
  currentDiffMode = mode;
  const btnSide = document.getElementById('btnDiffSideBySide');
  const btnUnified = document.getElementById('btnDiffUnified');

  if (mode === 'side-by-side') {
    if (btnSide) btnSide.classList.add('active');
    if (btnUnified) btnUnified.classList.remove('active');
  } else {
    if (btnUnified) btnUnified.classList.add('active');
    if (btnSide) btnSide.classList.remove('active');
  }

  if (currentModalRepo) {
    renderWorkflowsList(currentModalRepo, currentModalWorkflows);
  }
}

async function loadRepoWorkflows(repoName, customLabel = '') {
  const body = document.getElementById('wfModalBody');
  const res = await window.gitRunnerAPI.fetchWorkflows(repoName, customLabel);

  if (!res.success) {
    if (body) {
      body.innerHTML = `
        <div style="padding: 24px; background: rgba(239, 68, 68, 0.1); border: 1px solid rgba(239, 68, 68, 0.3); border-radius: 10px; color: #fca5a5;">
          <h4 style="margin-bottom: 6px;">❌ Không thể tải danh sách workflow</h4>
          <p style="font-size: 13px; line-height: 1.5;">${res.error || 'Vui lòng kiểm tra quyền hạn của GitHub token.'}</p>
          <button class="btn-primary-action" onclick="openLoginModal()" style="margin-top: 14px;">
            <span>🔑</span> Kiểm tra hoặc Cấp lại Token
          </button>
        </div>
      `;
    }
    return;
  }

  currentModalWorkflows = res.workflows || [];
  renderWorkflowsList(repoName, currentModalWorkflows, customLabel || res.suggestedLabel);
}

function renderWorkflowsList(repoName, workflows, defaultLabel = '') {
  const body = document.getElementById('wfModalBody');
  if (!body) return;

  const suggestedLabel = defaultLabel || (repoName.includes('/') ? `grh-${repoName.split('/')[1].toLowerCase().replace(/[^a-z0-9]+/g, '-')}` : 'grh-local-runner');

  if (workflows.length === 0) {
    body.innerHTML = `
      <div style="padding: 30px; text-align: center; color: var(--muted); background: var(--surface2); border: 1px dashed var(--border); border-radius: 12px;">
        <div style="font-size: 32px; margin-bottom: 10px;">📂</div>
        <h4 style="color: var(--text); font-size: 15px; margin-bottom: 6px;">Chưa tìm thấy thư mục <code>.github/workflows</code></h4>
        <p style="font-size: 13px; color: var(--dim); max-width: 480px; margin: 0 auto 16px auto; line-height: 1.5;">
          Repository này chưa có cấu hình GitHub Actions CI nào. Bạn có thể thêm file workflow (ví dụ: <code>.github/workflows/ci.yml</code>) với cấu hình <code>runs-on: [self-hosted, Linux, X64, ${suggestedLabel}]</code>.
        </p>
      </div>
    `;
    return;
  }

  // Cảnh báo an toàn nếu là Public Repository [GRH-207]
  const repoMeta = allRepos.find(r => r.name === repoName);
  const isPublicRepo = repoMeta && !repoMeta.isPrivate;
  let securityBannerHtml = '';
  if (isPublicRepo) {
    securityBannerHtml = `
      <div style="background: rgba(245, 158, 11, 0.12); border: 1px solid rgba(245, 158, 11, 0.35); color: #fde68a; padding: 10px 14px; border-radius: 8px; margin-bottom: 14px; font-size: 12px; display: flex; align-items: center; gap: 8px;">
        <span>🛡️</span>
        <div><b>Repo công khai:</b> Khuyến nghị chỉ chạy Self-Hosted Runner cho nhánh nội bộ để đảm bảo an toàn.</div>
      </div>
    `;
  }

  let html = securityBannerHtml;

  workflows.forEach((wf, idx) => {
    const isSelfHosted = wf.routing === 'SELF_HOSTED';
    const isMixed = wf.routing === 'MIXED';

    let badgeClass = 'warning';
    let badgeText = '⚠️ Đang dùng GitHub-Hosted (Cần sửa)';
    if (isSelfHosted) {
      badgeClass = 'success';
      badgeText = '🟢 Đã gắn Self-Hosted Runner';
    } else if (isMixed) {
      badgeClass = 'info';
      badgeText = '🔄 Đang dùng cả 2 loại';
    }

    const runsOnDesc = wf.runsOnLines.map(r => `Dòng ${r.lineNumber}: <code>${escapeHtml(r.lineContent)}</code>`).join('<br>');

    // TẠO KHỐI VISUAL DIFF (SIDE-BY-SIDE HOẶC UNIFIED)
    let diffHtml = '';
    if (wf.diffs && wf.diffs.length > 0) {
      if (currentDiffMode === 'side-by-side') {
        diffHtml = `
          <div class="diff-side-by-side-grid">
            <div>
              <div class="diff-col-header del">◀ BEFORE (Original)</div>
              <div class="diff-side-box before">
                ${wf.diffs.map(d => `<div>${escapeHtml(d.original || '')}</div>`).join('')}
              </div>
            </div>
            <div>
              <div class="diff-col-header add">▶ AFTER (Proposed Patch)</div>
              <div class="diff-side-box after">
                ${wf.diffs.map(d => `<div>${escapeHtml(d.patched || '')}</div>`).join('')}
              </div>
            </div>
          </div>
        `;
      } else {
        diffHtml = `
          <div class="diff-unified-container">
            ${wf.diffs.map(d => {
              let row = '';
              if (d.original) row += `<div class="diff-line-del">- Dòng ${d.line || ''}: ${escapeHtml(d.original)}</div>`;
              if (d.patched) row += `<div class="diff-line-add">+ Dòng ${d.line || ''}: ${escapeHtml(d.patched)}</div>`;
              return row;
            }).join('')}
          </div>
        `;
      }
    }

    const patchButtonHtml = wf.needsPatch ? `
      <button class="btn-commit-patch" id="btnPatch_${idx}" onclick="handleCommitWorkflowPatch('${repoName}', '${wf.path}', '${wf.sha}', ${idx})">
        <span>🚀</span> 1-Click Sửa & Đẩy lên GitHub
      </button>
    ` : `
      <div style="display: flex; align-items: center; gap: 8px; flex-wrap: wrap;">
        <span style="font-size: 12px; color: #34d399; font-weight: 600;">✓ Đã trỏ về Self-Hosted</span>
        <button class="btn-rollback" id="btnRollback_${idx}" onclick="handleRollbackWorkflow('${repoName}', '${wf.path}', '${wf.sha}', ${idx})" title="Chuyển lại về ubuntu-latest">
          <span>↩️</span> Rollback về Ubuntu-Latest
        </button>
      </div>
    `;

    const dispatchButtonHtml = `
      <button class="btn-dispatch" id="btnDispatch_${idx}" onclick="handleDispatchTestRun('${repoName}', '${wf.name}', ${idx})" title="Khởi chạy CI run thử nghiệm trên GitHub để kiểm chứng runner">
        <span>▶️</span> Test CI Run
      </button>
    `;

    html += `
      <div class="workflow-file-card" id="wfCard_${idx}">
        <div class="workflow-file-header">
          <div class="wf-path-group">
            <span>📄</span>
            <span>${wf.path}</span>
          </div>
          <div style="display: flex; gap: 8px; align-items: center;">
            <span class="wf-badge ${badgeClass}">${badgeText}</span>
            ${dispatchButtonHtml}
          </div>
        </div>

        <div style="font-size: 12px; color: var(--muted); margin-bottom: 10px; line-height: 1.5;">
          <b>Khai báo hiện tại:</b><br>${runsOnDesc || 'Không tìm thấy dòng runs-on'}
        </div>

        ${diffHtml}

        <div class="wf-patch-footer">
          <div class="wf-label-input-group">
            <span>Nhãn Runner cách ly:</span>
            <input type="text" class="wf-label-input" id="wfLabel_${idx}" value="${escapeHtml(suggestedLabel)}" placeholder="Nhãn riêng..." onchange="handleReloadDiffWithLabel('${repoName}', ${idx})" title="Nhãn riêng biệt bảo đảm GitHub Actions chỉ điều phối job về máy này" />
          </div>
          <div class="wf-action-buttons-group">
            ${patchButtonHtml}
          </div>
        </div>

        <div id="wfCommitStatus_${idx}" style="display: none;"></div>
        <div id="wfVerificationBox_${idx}" class="run-verification-box" style="display: none;"></div>
      </div>
    `;
  });

  body.innerHTML = html;
}

async function handleReloadDiffWithLabel(repoName, index) {
  const labelInput = document.getElementById(`wfLabel_${index}`);
  const label = labelInput ? labelInput.value.trim() : '';
  await loadRepoWorkflows(repoName, label);
}

async function handleCommitWorkflowPatch(repoName, filePath, sha, index) {
  const wf = currentModalWorkflows[index];
  if (!wf) return;

  const btn = document.getElementById(`btnPatch_${index}`);
  const statusBox = document.getElementById(`wfCommitStatus_${index}`);
  const labelInput = document.getElementById(`wfLabel_${index}`);
  const customLabel = labelInput ? labelInput.value.trim() : '';

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinning">🔄</span> Đang tạo commit qua GitHub API...`;
  }

  try {
    const res = await window.gitRunnerAPI.commitWorkflowPatch({
      repoFullName: repoName,
      filePath: wf.path,
      patchedContent: wf.patchedContent,
      sha: wf.sha,
      message: `ci: route ${wf.name} to self-hosted runner via GitRunnerHub [1-click patch]`
    });

    if (res.success) {
      statusBox.style.display = 'flex';
      statusBox.className = 'wf-commit-success-box';
      const shortSha = res.commitSha ? res.commitSha.substring(0, 7) : 'mới';
      const commitUrl = res.commitUrl || `https://github.com/${repoName}/commits`;

      statusBox.innerHTML = `
        <div>
          🎉 <b>Thành công!</b> Dòng <code>runs-on</code> đã được sửa thành <code>[self-hosted, Linux, X64, ${customLabel}]</code>.<br>
          <span style="font-size: 11px; opacity: 0.85;">Commit: <code>${shortSha}</code> trên GitHub. Mọi lần push/PR tiếp theo sẽ tự động chạy trên máy của bạn!</span>
        </div>
        <a class="wf-commit-link" href="${commitUrl}" target="_blank">Xem trên GitHub ↗</a>
      `;

      if (btn) {
        btn.innerHTML = `<span>✓</span> Đã sửa xong!`;
        btn.disabled = true;
      }

      await fetchAndApplyWorkflowSummary(repoName);

      setTimeout(() => {
        loadRepoWorkflows(repoName, customLabel);
      }, 2000);

    } else {
      statusBox.style.display = 'block';
      statusBox.style.background = 'rgba(239, 68, 68, 0.15)';
      statusBox.style.border = '1px solid rgba(239, 68, 68, 0.3)';
      statusBox.style.color = '#fca5a5';
      statusBox.innerHTML = `❌ Lỗi khi commit: ${res.error || 'Không thể ghi file lên GitHub'}`;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>🚀</span> Thử lại 1-Click Patch`;
      }
    }
  } catch (err) {
    statusBox.style.display = 'block';
    statusBox.innerHTML = `❌ Lỗi kết nối: ${err.message}`;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>🚀</span> Thử lại 1-Click Patch`;
    }
  }
}

async function handleRollbackWorkflow(repoName, filePath, sha, index) {
  const wf = currentModalWorkflows[index];
  if (!wf) return;

  if (!confirm(`Bạn có chắc chắn muốn HOÀN TÁC (Rollback) file '${wf.name}' trở lại 'runs-on: ubuntu-latest'?`)) return;

  const btn = document.getElementById(`btnRollback_${index}`);
  const statusBox = document.getElementById(`wfCommitStatus_${index}`);
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinning">🔄</span> Đang rollback...`;
  }

  try {
    const res = await window.gitRunnerAPI.rollbackWorkflowPatch({
      repoFullName: repoName,
      filePath: wf.path,
      originalContent: wf.originalContent,
      sha: wf.sha
    });

    if (res.success) {
      statusBox.style.display = 'flex';
      statusBox.className = 'wf-commit-success-box';
      statusBox.innerHTML = `
        <div>
          ↩️ <b>Đã hoàn tác thành công!</b> File workflow đã quay lại chạy trên <code>ubuntu-latest</code>.
        </div>
      `;

      await fetchAndApplyWorkflowSummary(repoName);

      setTimeout(() => {
        loadRepoWorkflows(repoName);
      }, 1500);
    } else {
      alert('Lỗi rollback: ' + res.error);
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>↩️</span> Rollback về Ubuntu-Latest`;
      }
    }
  } catch (e) {
    alert('Lỗi: ' + e.message);
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>↩️</span> Rollback về Ubuntu-Latest`;
    }
  }
}

async function handleDispatchTestRun(repoName, workflowFileName, index) {
  const btn = document.getElementById(`btnDispatch_${index}`);
  const verifyBox = document.getElementById(`wfVerificationBox_${index}`);

  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinning">🔄</span> Đang gửi lệnh...`;
  }

  verifyBox.style.display = 'block';
  verifyBox.innerHTML = `
    <div class="run-verification-header">
      <span>Đang kích hoạt CI Run trên GitHub...</span>
      <span class="verification-badge unverified"><span class="spinning">🔄</span> Đang gửi</span>
    </div>
    <div style="color: var(--dim);">Đang gửi sự kiện workflow_dispatch lên GitHub Actions...</div>
  `;

  try {
    const res = await window.gitRunnerAPI.dispatchWorkflowRun({
      repoFullName: repoName,
      workflowFile: workflowFileName,
      ref: 'main'
    });

    if (!res.success) {
      verifyBox.innerHTML = `
        <div style="color: #fca5a5;">
          ⚠️ Không thể kích hoạt tự động: ${res.error}.<br>
          <span style="font-size:11px; opacity:0.8;">(Gợi ý: Workflow cần có trigger <code>workflow_dispatch</code> hoặc bạn có thể tạo 1 commit nhỏ để kích hoạt).</span>
        </div>
      `;
      if (btn) {
        btn.disabled = false;
        btn.innerHTML = `<span>▶️</span> Test CI Run`;
      }
      return;
    }

    verifyBox.innerHTML = `
      <div class="run-verification-header">
        <span>🚀 Đã kích hoạt CI Run thành công!</span>
        <span class="verification-badge unverified"><span class="spinning">🔄</span> Chờ runner nhận job</span>
      </div>
      <div style="color: var(--dim);">Đang liên tục đối soát runner thực thi...</div>
    `;

    pollExecutionVerification(repoName, index, 0);

  } catch (e) {
    verifyBox.innerHTML = `<div style="color: #fca5a5;">❌ Lỗi: ${e.message}</div>`;
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>▶️</span> Test CI Run`;
    }
  }
}

async function pollExecutionVerification(repoName, index, attempt) {
  const verifyBox = document.getElementById(`wfVerificationBox_${index}`);
  const btn = document.getElementById(`btnDispatch_${index}`);
  if (attempt > 10) {
    if (verifyBox) {
      verifyBox.innerHTML += `<div style="margin-top:6px; color:var(--dim);">Hết thời gian chờ phản hồi trực tiếp. Bạn có thể mở mục "Lịch sử CI" để xem kết quả.</div>`;
    }
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `<span>▶️</span> Test CI Run`;
    }
    return;
  }

  setTimeout(async () => {
    try {
      const runInfo = await window.gitRunnerAPI.getLatestWorkflowRun({ repoFullName: repoName, runnerName: 'local' });
      if (runInfo.success && runInfo.hasRun) {
        const isVerified = runInfo.isVerifiedOnLocalRunner;
        const statusBadge = isVerified 
          ? `<span class="verification-badge verified">✅ ĐÃ ĐỐI SOÁT: Chạy trên Local Runner</span>`
          : `<span class="verification-badge unverified">Trạng thái: ${runInfo.status}</span>`;

        verifyBox.innerHTML = `
          <div class="run-verification-header">
            <span>Workflow Run #${runInfo.runId} (${runInfo.name})</span>
            ${statusBadge}
          </div>
          <div style="display: flex; gap: 14px; font-size: 11px; color: var(--dim); margin-top: 4px;">
            <span>Commit: <code>${(runInfo.headSha || '').substring(0, 7)}</code></span>
            <span>Kết quả: <b style="color: ${runInfo.conclusion === 'success' ? '#34d399' : '#f59e0b'}">${runInfo.conclusion || runInfo.status}</b></span>
            <a href="${runInfo.htmlUrl}" target="_blank" style="color: #38bdf8; text-decoration: underline;">Xem trên GitHub ↗</a>
          </div>
        `;

        if (runInfo.status === 'completed' || isVerified) {
          if (btn) {
            btn.disabled = false;
            btn.innerHTML = `<span>▶️</span> Test CI Run`;
          }
          return;
        }
      }
      pollExecutionVerification(repoName, index, attempt + 1);
    } catch (e) {
      pollExecutionVerification(repoName, index, attempt + 1);
    }
  }, 3000);
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

// Khởi chạy ứng dụng
init();
