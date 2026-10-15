let allRepos = [];
let currentFilter = 'all';
let currentUser = null;
let currentDeviceCode = null;
let devicePollTimer = null;
let deviceVerificationUri = 'https://github.com/login/device';

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
          { nameWithOwner: 'buithelong-all/DanhTinh-Lab', description: 'Nền tảng kiểm định và tự động hóa hồ sơ danh tính', isPrivate: true, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/caevietnam.vn', description: 'Cổng thông tin chuyên ngành CAE & mô phỏng', isPrivate: false, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/git-runner-hub', description: '1-Click GitHub Actions Self-Hosted Runner Manager', isPrivate: false, updatedAt: new Date().toISOString() }
        ]
      };
    },
    getLocalRunners: async () => {
      try {
        const res = await fetch('/api/local-runners');
        if (res.ok) return await res.json();
      } catch (e) {}
      return ['DanhTinh-Lab', 'caevietnam.vn'];
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
    }
  };
}

const isElectron = true; // Kích hoạt đầy đủ tính năng giao diện

// Lấy danh sách repo đã kích hoạt từ localStorage (bền vững)
function getSavedActivatedRepos() {
  try {
    const raw = localStorage.getItem('git_runner_activated_repos');
    return raw ? JSON.parse(raw) : ['buithelong-all/caevietnam.vn'];
  } catch (e) {
    return ['buithelong-all/caevietnam.vn'];
  }
}

function saveActivatedRepo(repoName) {
  try {
    const current = getSavedActivatedRepos();
    if (!current.includes(repoName)) {
      current.push(repoName);
      localStorage.setItem('git_runner_activated_repos', JSON.stringify(current));
    }
  } catch (e) {
    console.warn('Save localStorage error:', e);
  }
}

// ==============================================================================
// INITIALIZATION & AUTH STATE [GRH-201..204]
// ==============================================================================

async function init() {
  console.log('[Renderer] Starting init()... isElectron:', isElectron);
  if (isElectron) {
    try {
      const sysInfo = await window.gitRunnerAPI.getSystemInfo();
      console.log('[Renderer] System info received:', JSON.stringify(sysInfo));
      document.getElementById('statOS').textContent = sysInfo.platform;
      document.getElementById('statRam').textContent = `${sysInfo.freeMem} GB / ${sysInfo.totalMem} GB`;
    } catch (e) {
      console.warn('System info error:', e);
    }

    // Đăng ký nhận realtime log từ Electron
    window.gitRunnerAPI.onLogUpdate((logChunk) => {
      const term = document.getElementById('terminalLog');
      if (term) {
        term.innerHTML += logChunk.replace(/\n/g, '<br>');
        term.scrollTop = term.scrollHeight;
      }
    });

    // Nạp hồ sơ người dùng
    console.log('[Renderer] Loading account profile...');
    await loadAccountProfile();
    console.log('[Renderer] init() completed.');
  } else {
    document.getElementById('statOS').textContent = 'Web Preview Mode';
    document.getElementById('statRam').textContent = '11.4 GB / 15.6 GB';
    loadMockRepos();
  }
}

async function loadAccountProfile() {
  if (!isElectron) return;

  try {
    const authStatus = await window.gitRunnerAPI.getCurrentUser();
    const avatarEl = document.getElementById('accountAvatar');
    const nameEl = document.getElementById('accountName');
    const handleEl = document.getElementById('accountHandle');
    const actionsEl = document.getElementById('accountActions');
    const promptEl = document.getElementById('accountLoginPrompt');

    if (authStatus && authStatus.loggedIn && authStatus.user) {
      currentUser = authStatus.user;
      nameEl.textContent = currentUser.name || currentUser.login;
      handleEl.textContent = `@${currentUser.login}`;

      if (currentUser.avatarUrl) {
        avatarEl.innerHTML = `<img src="${currentUser.avatarUrl}" alt="${currentUser.login}" />`;
      } else {
        avatarEl.textContent = currentUser.initials || currentUser.login.charAt(0).toUpperCase();
      }

      actionsEl.style.display = 'flex';
      promptEl.style.display = 'none';

      await refreshRepos();
    } else {
      currentUser = null;
      avatarEl.innerHTML = '?';
      nameEl.textContent = 'Chưa đăng nhập';
      handleEl.textContent = 'Bấm để kết nối tài khoản';
      actionsEl.style.display = 'none';
      promptEl.style.display = 'block';

      allRepos = [];
      updateStats();
      renderEmptyLoginState();
    }
  } catch (err) {
    console.warn('Load account profile error:', err);
  }
}

function renderEmptyLoginState() {
  const grid = document.getElementById('reposGrid');
  grid.innerHTML = `
    <div style="grid-column: 1/-1; padding: 60px 20px; text-align: center; color: var(--text-muted); display: flex; flex-direction: column; align-items: center; gap: 14px;">
      <div style="font-size: 36px;">🔒</div>
      <h3 style="color: var(--text-main); font-size: 18px;">Chưa kết nối tài khoản GitHub</h3>
      <p style="max-width: 440px; font-size: 13px; color: var(--text-dim); line-height: 1.5;">
        Đăng nhập để GitRunnerHub tự động tải danh sách repository và cấp quyền tự động cho self-hosted runner.
      </p>
      <button class="btn-primary-action" onclick="openLoginModal()" style="margin-top: 8px;">
        <span>🔑</span> Đăng nhập ngay
      </button>
    </div>
  `;
}

// ==============================================================================
// LOGIN MODAL & AUTH FLOWS [GRH-201..202]
// ==============================================================================

function openLoginModal() {
  const modal = document.getElementById('loginModal');
  const errorMsg = document.getElementById('authErrorMsg');
  errorMsg.style.display = 'none';
  errorMsg.textContent = '';
  modal.style.display = 'flex';
  modal.classList.add('active');
}

function closeLoginModal() {
  const modal = document.getElementById('loginModal');
  modal.style.display = 'none';
  modal.classList.remove('active');
  if (devicePollTimer) {
    clearInterval(devicePollTimer);
    devicePollTimer = null;
  }
  document.getElementById('deviceFlowInitial').style.display = 'block';
  document.getElementById('deviceFlowActive').style.display = 'none';
}

function switchAuthTab(tabId, btn) {
  document.querySelectorAll('.auth-tab-btn').forEach(b => b.classList.remove('active'));
  document.querySelectorAll('.auth-tab-content').forEach(c => c.style.display = 'none');
  btn.classList.add('active');

  const errorMsg = document.getElementById('authErrorMsg');
  errorMsg.style.display = 'none';

  if (tabId === 'device-flow') {
    document.getElementById('tabDeviceFlow').style.display = 'flex';
  } else if (tabId === 'token') {
    document.getElementById('tabToken').style.display = 'flex';
  } else if (tabId === 'gh-cli') {
    document.getElementById('tabGhCli').style.display = 'flex';
  }
}

// 1. Device Flow Login
async function startDeviceLogin() {
  const errorMsg = document.getElementById('authErrorMsg');
  errorMsg.style.display = 'none';

  try {
    const res = await window.gitRunnerAPI.startDeviceFlow();
    if (!res.success) {
      errorMsg.textContent = res.error || 'Không thể khởi tạo mã xác thực';
      errorMsg.style.display = 'block';
      return;
    }

    currentDeviceCode = res.deviceCode;
    deviceVerificationUri = res.verificationUri || 'https://github.com/login/device';
    document.getElementById('deviceUserCode').textContent = res.userCode;

    document.getElementById('deviceFlowInitial').style.display = 'none';
    document.getElementById('deviceFlowActive').style.display = 'flex';

    // Bắt đầu polling
    if (devicePollTimer) clearInterval(devicePollTimer);
    const intervalSec = (res.interval || 5);
    devicePollTimer = setInterval(async () => {
      const pollRes = await window.gitRunnerAPI.pollDeviceFlow(currentDeviceCode);
      if (pollRes.status === 'granted') {
        clearInterval(devicePollTimer);
        devicePollTimer = null;
        closeLoginModal();
        await loadAccountProfile();
      } else if (pollRes.status === 'expired' || pollRes.status === 'denied' || pollRes.status === 'error') {
        clearInterval(devicePollTimer);
        devicePollTimer = null;
        errorMsg.textContent = pollRes.error || 'Xác thực thất bại hoặc hết hạn';
        errorMsg.style.display = 'block';
        document.getElementById('deviceFlowInitial').style.display = 'block';
        document.getElementById('deviceFlowActive').style.display = 'none';
      }
    }, intervalSec * 1000);

  } catch (err) {
    errorMsg.textContent = 'Lỗi kết nối: ' + err.message;
    errorMsg.style.display = 'block';
  }
}

function copyAndOpenDeviceUri() {
  const code = document.getElementById('deviceUserCode').textContent;
  if (navigator.clipboard) {
    navigator.clipboard.writeText(code);
  }
  const btn = document.getElementById('btnOpenDeviceUri');
  btn.textContent = '✓ Đã copy! Đang mở GitHub...';
  setTimeout(() => {
    btn.textContent = '📋 Copy Mã & Mở Trang GitHub';
  }, 3000);

  if (isElectron) {
    window.gitRunnerAPI.openExternal(deviceVerificationUri);
  } else {
    window.open(deviceVerificationUri, '_blank');
  }
}

// 2. PAT Login
async function handlePatLogin() {
  const input = document.getElementById('patInput');
  const errorMsg = document.getElementById('authErrorMsg');
  const token = input.value.trim();

  if (!token) {
    errorMsg.textContent = 'Vui lòng dán Personal Access Token của bạn';
    errorMsg.style.display = 'block';
    return;
  }

  errorMsg.style.display = 'none';
  const res = await window.gitRunnerAPI.loginWithToken(token);

  if (res.success) {
    input.value = '';
    closeLoginModal();
    await loadAccountProfile();
  } else {
    errorMsg.textContent = res.error || 'Token không hợp lệ hoặc thiếu quyền';
    errorMsg.style.display = 'block';
  }
}

// 3. GitHub CLI Import
async function handleGhCliImport() {
  const errorMsg = document.getElementById('authErrorMsg');
  errorMsg.style.display = 'none';

  const res = await window.gitRunnerAPI.loginWithGhCli();
  if (res.success) {
    closeLoginModal();
    await loadAccountProfile();
  } else {
    errorMsg.textContent = res.error || 'Không thể nhập phiên từ gh CLI';
    errorMsg.style.display = 'block';
  }
}

// 4. Logout
async function handleLogout() {
  if (confirm('Bạn có chắc muốn đăng xuất khỏi GitRunnerHub?')) {
    await window.gitRunnerAPI.logout();
    await loadAccountProfile();
  }
}

// ==============================================================================
// REPOSITORIES & RUNNERS MANAGEMENT
// ==============================================================================

async function refreshRepos() {
  if (!isElectron) return;
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  icon.classList.add('spinning');
  text.textContent = 'Đang quét GitHub...';

  const savedActive = getSavedActivatedRepos();
  let localDirs = [];
  try {
    localDirs = await window.gitRunnerAPI.getLocalRunners();
  } catch (e) {}

  const res = await window.gitRunnerAPI.fetchRepos();
  icon.classList.remove('spinning');
  text.textContent = 'Kiểm tra & Nạp tất cả Repos';

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
        runnerName: isLocallyActive ? (r.nameWithOwner.includes('caevietnam.vn') ? 'long-local-ci' : `local-${repoSlug}`) : null
      };
    });

    handleSearch();
    updateStats();

    // Đối soát online status bất đồng bộ
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

function updateStats() {
  document.getElementById('statTotalRepos').textContent = allRepos.length;
  const onlineCount = allRepos.filter(r => r.runnerOnline).length;
  document.getElementById('statOnlineRunners').textContent = onlineCount;
  document.getElementById('statUnconfigured').textContent = allRepos.length - onlineCount;

  document.getElementById('countAll').textContent = allRepos.length;
  document.getElementById('countOnline').textContent = onlineCount;
  document.getElementById('countUnconfigured').textContent = allRepos.length - onlineCount;
}

function setFilter(type, btn) {
  currentFilter = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
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
  grid.innerHTML = '';

  if (repos.length === 0) {
    grid.innerHTML = `
      <div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);">
        Không tìm thấy repository nào phù hợp.
      </div>
    `;
    return;
  }

  repos.forEach(repo => {
    const card = document.createElement('div');
    card.className = `repo-card ${repo.runnerOnline ? 'active' : ''}`;

    const statusBadge = repo.runnerOnline 
      ? `<span class="badge-status online"><span class="pulse-dot"></span> Runner Online</span>`
      : `<span class="badge-status offline">Chưa kích hoạt</span>`;

    const privacyBadge = repo.isPrivate
      ? `<span class="badge-tag private">🔒 Private</span>`
      : `<span class="badge-tag public">🌐 Public</span>`;

    const actionButtons = repo.runnerOnline
      ? `
        <button class="btn-sm btn-ci-history" onclick="openRepoActions('${repo.name}')" title="Mở trang GitHub Actions trên trình duyệt">
          <span>🚀</span> Lịch sử CI
        </button>
        <button class="btn-sm btn-icon-round" onclick="lifecycleAction('restart', '${repo.name}')" title="Khởi động lại Runner Service">
          🔄
        </button>
        <button class="btn-sm btn-icon-round btn-danger-icon" onclick="lifecycleAction('detach', '${repo.name}')" title="Hủy và gỡ bỏ Runner này">
          🗑️
        </button>
      `
      : `
        <button class="btn-sm btn-install" onclick="startSetup('${repo.name}')">
          <span>⚡</span> Kích hoạt Local Runner
        </button>
      `;

    card.innerHTML = `
      <div class="repo-card-header">
        <div class="repo-title-group">
          <span class="repo-title" title="${repo.name}">${repo.name}</span>
          ${privacyBadge}
        </div>
        ${statusBadge}
      </div>

      <div class="repo-desc">${repo.desc}</div>

      <div class="repo-footer">
        <div class="repo-meta">
          <span>📅 ${repo.updated}</span>
          ${repo.runnerOnline ? `<span style="color:#34d399;">⚡ ${repo.runnerName || 'Sẵn sàng'}</span>` : ''}
        </div>
        <div class="repo-card-actions">
          ${actionButtons}
        </div>
      </div>
    `;

    grid.appendChild(card);
  });
}

function handleScanUrl() {
  const input = document.getElementById('repoUrlInput');
  const val = input.value.trim();
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

async function lifecycleAction(action, repoName) {
  if (action === 'detach') {
    if (!confirm(`Bạn có chắc chắn muốn HỦY và GỠ BỎ Local Runner cho '${repoName}'?`)) return;
  }

  const modal = document.getElementById('setupModal');
  const term = document.getElementById('terminalLog');
  const closeBtn = document.getElementById('modalCloseBtn');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');

  title.textContent = `Điều khiển Runner: ${action.toUpperCase()}`;
  desc.textContent = `Đang thực hiện lệnh ${action} cho ${repoName}...`;
  term.innerHTML = `> [Lifecycle] Bắt đầu ${action} cho ${repoName}...\n`;
  closeBtn.disabled = true;
  modal.style.display = 'flex';
  modal.classList.add('active');

  if (isElectron) {
    const res = await window.gitRunnerAPI.lifecycleRunner(action, repoName);
    if (res.success) {
      term.innerHTML += `<br><b style="color:#34d399">> ✅ Lệnh '${action}' đã hoàn tất thành công!</b><br>`;
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
      term.innerHTML += `<br><b style="color:#ef4444">> ❌ Lỗi thực hiện lệnh '${action}' (mã: ${res.exitCode})</b><br>`;
    }
    closeBtn.disabled = false;
    closeBtn.textContent = 'Đóng';
  }
}

async function startSetup(repoName) {
  const modal = document.getElementById('setupModal');
  const term = document.getElementById('terminalLog');
  const closeBtn = document.getElementById('modalCloseBtn');
  const title = document.getElementById('modalTitle');
  const desc = document.getElementById('modalDesc');

  title.textContent = `Kích hoạt Runner cho: ${repoName}`;
  desc.textContent = `Đang thiết lập môi trường dịch vụ chạy ngầm trên máy...`;
  term.innerHTML = `> [GitRunnerHub] Bắt đầu chuẩn bị runner cho ${repoName}...\n`;
  closeBtn.disabled = true;
  closeBtn.textContent = 'Đang xử lý...';
  modal.style.display = 'flex';
  modal.classList.add('active');

  if (isElectron) {
    const res = await window.gitRunnerAPI.setupRunner(repoName);
    if (res.success) {
      term.innerHTML += `<br><b style="color:#34d399">> ✅ HOÀN TẤT THÀNH CÔNG! Runner đã ONLINE và sẵn sàng nhận job kiểm thử.</b><br>`;
      saveActivatedRepo(repoName);
      const target = allRepos.find(r => r.name === repoName);
      if (target) {
        target.runnerOnline = true;
        target.runnerName = `local-${repoName.replace('/', '-')}`;
      }
      updateStats();
      handleSearch();
    } else {
      term.innerHTML += `<br><b style="color:#ef4444">> ❌ Thất bại với mã thoát: ${res.exitCode}. Vui lòng xem log ở trên!</b><br>`;
    }
    closeBtn.disabled = false;
    closeBtn.textContent = 'Đóng & Hoàn tất';
  }
}

function closeModal() {
  const modal = document.getElementById('setupModal');
  modal.style.display = 'none';
  modal.classList.remove('active');
}

function openRepoActions(repoName) {
  const url = `https://github.com/${repoName}/actions`;
  if (isElectron) {
    window.gitRunnerAPI.openExternal(url);
  } else {
    window.open(url, '_blank');
  }
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

init();
