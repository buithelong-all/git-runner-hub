let allRepos = [];
let currentFilter = 'all';

// Kiểm tra xem đang chạy trong môi trường Electron hay Browser
const isElectron = typeof window.gitRunnerAPI !== 'undefined';

async function init() {
  if (isElectron) {
    try {
      const sysInfo = await window.gitRunnerAPI.getSystemInfo();
      document.getElementById('statOS').textContent = sysInfo.platform;
      document.getElementById('statRam').textContent = `${sysInfo.freeMem} GB / ${sysInfo.totalMem} GB`;
      if (sysInfo.ghAccount && sysInfo.ghAccount !== 'Unknown') {
        document.getElementById('accountHandle').textContent = `@${sysInfo.ghAccount}`;
        document.getElementById('accountAvatar').textContent = sysInfo.ghAccount.charAt(0).toUpperCase();
      }
    } catch (e) {
      console.warn('System info error:', e);
    }

    // Đăng ký nhận realtime log từ Electron main process
    window.gitRunnerAPI.onLogUpdate((logChunk) => {
      const term = document.getElementById('terminalLog');
      term.innerHTML += logChunk.replace(/\n/g, '<br>');
      term.scrollTop = term.scrollHeight;
    });

    await refreshRepos();
  } else {
    // Chạy trên web browser (Mock Demo fallback)
    document.getElementById('statOS').textContent = 'Web Preview Mode';
    document.getElementById('statRam').textContent = '11.4 GB / 15.6 GB';
    loadMockRepos();
  }
}

async function refreshRepos() {
  const icon = document.getElementById('syncIcon');
  const text = document.getElementById('syncText');
  icon.classList.add('spinning');
  text.textContent = 'Đang quét GitHub...';

  if (isElectron) {
    const res = await window.gitRunnerAPI.fetchRepos();
    icon.classList.remove('spinning');
    text.textContent = 'Kiểm tra & Nạp tất cả Repos';

    if (res.success && res.repos) {
      allRepos = res.repos.map(r => ({
        name: r.nameWithOwner,
        desc: r.description || 'Chưa có mô tả.',
        isPrivate: r.isPrivate,
        updated: formatDate(r.updatedAt),
        runnerOnline: false,
        runnerName: null
      }));

      // Quét trạng thái runner cho từng repo
      for (const repo of allRepos) {
        window.gitRunnerAPI.checkRunnerStatus(repo.name).then(status => {
          if (status.isOnline) {
            repo.runnerOnline = true;
            repo.runnerName = status.runnerName;
            updateStats();
            handleSearch();
          }
        });
      }

      handleSearch();
      updateStats();
    } else {
      alert('Lỗi nạp repos: ' + (res.error || 'Vui lòng kiểm tra đăng nhập gh CLI!'));
    }
  } else {
    setTimeout(() => {
      icon.classList.remove('spinning');
      text.textContent = 'Kiểm tra & Nạp tất cả Repos';
      loadMockRepos();
      alert('Đã làm mới danh sách repositories!');
    }, 800);
  }
}

function loadMockRepos() {
  allRepos = [
    {
      name: "buithelong-all/caevietnam.vn",
      desc: "Cổng thông tin & bài thi CAE Vietnam Monorepo (Production Staging).",
      isPrivate: true,
      runnerOnline: true,
      runnerName: "long-local-ci",
      updated: "2 giờ trước"
    },
    {
      name: "buithelong-all/git-runner-hub",
      desc: "1-Click GitHub Actions Self-Hosted Runner Manager for Windows & macOS.",
      isPrivate: false,
      runnerOnline: false,
      runnerName: null,
      updated: "Vừa xong"
    },
    {
      name: "buithelong-all/DanhTinh-Lab",
      desc: "Dự án nghiên cứu & phát triển phòng lab Danh Tính.",
      isPrivate: true,
      runnerOnline: false,
      runnerName: null,
      updated: "Hôm nay"
    },
    {
      name: "buithelong-all/anti-rewrite-kit",
      desc: "Bộ quy trình chống đập đi làm lại: contract-freeze, hook SSRF, TDD.",
      isPrivate: true,
      runnerOnline: false,
      runnerName: null,
      updated: "3 ngày trước"
    }
  ];
  handleSearch();
  updateStats();
}

function updateStats() {
  const total = allRepos.length;
  const online = allRepos.filter(r => r.runnerOnline).length;
  const unconf = total - online;

  document.getElementById('statTotalRepos').textContent = total;
  document.getElementById('statOnlineRunners').textContent = online;
  document.getElementById('statUnconfigured').textContent = unconf;

  document.getElementById('countAll').textContent = total;
  document.getElementById('countOnline').textContent = online;
  document.getElementById('countUnconfigured').textContent = unconf;
}

function renderRepos(list) {
  const grid = document.getElementById('reposGrid');
  grid.innerHTML = '';

  if (list.length === 0) {
    grid.innerHTML = `<div style="grid-column: 1/-1; padding: 40px; text-align: center; color: var(--text-dim);">Không tìm thấy repository nào phù hợp.</div>`;
    return;
  }

  list.forEach(repo => {
    const card = document.createElement('div');
    card.className = `repo-card ${repo.runnerOnline ? 'active-runner' : ''}`;

    card.innerHTML = `
      <div class="card-top">
        <div class="repo-meta">
          <div class="repo-title">
            <span>${repo.isPrivate ? '🔒' : '🌐'}</span>
            <span title="${repo.name}">${repo.name}</span>
          </div>
          <div class="repo-desc">${repo.desc}</div>
        </div>
        <div class="status-pill ${repo.runnerOnline ? 'online' : 'unconfigured'}">
          ${repo.runnerOnline ? '● Runner Online' : '○ Chưa kích hoạt'}
        </div>
      </div>

      <div class="card-middle">
        <span>🕒 ${repo.updated}</span>
        ${repo.runnerOnline ? `<span>⚡ <b style="color:#34d399">Đang sẵn sàng</b></span>` : ''}
      </div>

      <div class="card-bottom">
        ${repo.runnerOnline ? `
          <div style="font-size: 11px; color: var(--text-dim);">
            Runner: <code style="color:var(--accent-cyan);">${repo.runnerName || 'local-runner'}</code>
          </div>
          <button class="btn-secondary" onclick="openRepoActions('${repo.name}')">Lịch sử CI</button>
        ` : `
          <div style="font-size: 11px; color: var(--text-dim);">${repo.isPrivate ? 'Private' : 'Public'}</div>
          <button class="btn-install" onclick="setupRunner('${repo.name}')">
            <span>⚡ Gắn Local CI</span>
          </button>
        `}
      </div>
    `;
    grid.appendChild(card);
  });
}

function setFilter(type, el) {
  currentFilter = type;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  el.classList.add('active');
  handleSearch();
}

function handleSearch() {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  let filtered = allRepos;

  if (currentFilter === 'online') {
    filtered = filtered.filter(r => r.runnerOnline);
  } else if (currentFilter === 'unconfigured') {
    filtered = filtered.filter(r => !r.runnerOnline);
  }

  if (q) {
    filtered = filtered.filter(r => r.name.toLowerCase().includes(q) || r.desc.toLowerCase().includes(q));
  }

  renderRepos(filtered);
}

function handleScanUrl() {
  const input = document.getElementById('repoUrlInput').value.trim();
  if (!input) {
    alert('Vui lòng dán link GitHub repo!');
    return;
  }

  let cleanRepo = input.replace('https://github.com/', '').replace('.git', '').replace(/\/$/, '');
  const existing = allRepos.find(r => r.name.toLowerCase() === cleanRepo.toLowerCase());

  if (existing) {
    if (existing.runnerOnline) {
      alert(`Repo ${cleanRepo} ĐÃ CÓ RUNNER ONLINE rồi anh! Không cần cấu hình lại.`);
    } else {
      setupRunner(cleanRepo);
    }
  } else {
    allRepos.unshift({
      name: cleanRepo,
      desc: "Repo mới nạp từ URL.",
      isPrivate: true,
      runnerOnline: false,
      runnerName: null,
      updated: "Vừa xong"
    });
    handleSearch();
    updateStats();
    setupRunner(cleanRepo);
  }
}

async function setupRunner(repoName) {
  const modal = document.getElementById('setupModal');
  const term = document.getElementById('terminalLog');
  const closeBtn = document.getElementById('modalCloseBtn');

  document.getElementById('modalTitle').textContent = `Đang kích hoạt Local CI cho: ${repoName}`;
  term.innerHTML = `> [GitRunnerHub] Đang chuẩn bị gói runner cho ${repoName}...<br>`;
  closeBtn.disabled = true;
  closeBtn.textContent = 'Đang kích hoạt...';
  modal.classList.add('active');

  if (isElectron) {
    const res = await window.gitRunnerAPI.setupRunner(repoName);
    if (res.success) {
      term.innerHTML += `<br><b style="color:#34d399">> ✅ HOÀN TẤT THÀNH CÔNG! Runner đã ONLINE và sẵn sàng nhận job kiểm thử.</b><br>`;
      const target = allRepos.find(r => r.name === repoName);
      if (target) {
        target.runnerOnline = true;
        target.runnerName = `local-${repoName.replace('/', '-')}`;
      }
      updateStats();
      handleSearch();
    } else {
      term.innerHTML += `<br><b style="color:#ef4444">> ❌ Thất bại với mã thoát: ${res.exitCode}. Vui lòng kiểm tra quyền sudo/root!</b><br>`;
    }
    closeBtn.disabled = false;
    closeBtn.textContent = 'Đóng';
  } else {
    // Giả lập trên Web Preview
    setTimeout(() => {
      term.innerHTML += `> Lấy registration token từ GitHub API... OK.<br>`;
      term.innerHTML += `> Cấu hình service systemd nền... OK.<br>`;
      term.innerHTML += `<b style="color:#34d399">> ✅ THÀNH CÔNG! Runner đã ONLINE.</b><br>`;
      const target = allRepos.find(r => r.name === repoName);
      if (target) {
        target.runnerOnline = true;
        target.runnerName = `local-${repoName.replace('/', '-')}`;
      }
      updateStats();
      handleSearch();
      closeBtn.disabled = false;
      closeBtn.textContent = 'Đóng';
    }, 1500);
  }
}

function closeModal() {
  document.getElementById('setupModal').classList.remove('active');
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

// Khởi chạy
init();
