const { app, BrowserWindow, ipcMain, shell, safeStorage } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');

const {
  validateToken,
  fetchUserReposWithToken,
  startDeviceFlow,
  pollDeviceFlow,
  saveAuthToken,
  loadAuthToken,
  clearAuthToken
} = require('../core/auth');

let mainWindow;
let currentAuth = null;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 780,
    minWidth: 980,
    minHeight: 640,
    backgroundColor: '#070a13',
    title: 'GitRunnerHub',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  mainWindow.setMenuBarVisibility(false);

  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
    mainWindow.focus();
  });
}

app.whenReady().then(() => {
  // Load saved session on startup
  try {
    currentAuth = loadAuthToken(app.getPath('userData'), safeStorage);
  } catch (e) {
    console.warn('Cannot load stored auth:', e.message);
  }

  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// ==============================================================================
// AUTH & IDENTITY IPC HANDLERS [GRH-201..204]
// ==============================================================================

// Lấy thông tin user hiện tại (hoặc auto-fallback gh CLI nếu máy dev đã có)
ipcMain.handle('auth:get-current-user', async () => {
  if (currentAuth && currentAuth.token) {
    return {
      loggedIn: true,
      user: currentAuth.user,
      method: 'stored'
    };
  }

  // Tự động kiểm tra gh CLI fallback nếu người dùng chưa cấu hình trong app
  return new Promise((resolve) => {
    exec('gh auth token', async (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        const ghToken = stdout.trim();
        const val = await validateToken(ghToken);
        if (val.valid) {
          currentAuth = { token: ghToken, user: val.user };
          saveAuthToken(app.getPath('userData'), ghToken, val.user, safeStorage);
          return resolve({ loggedIn: true, user: val.user, method: 'gh-cli' });
        }
      }
      resolve({ loggedIn: false, user: null });
    });
  });
});

// Đăng nhập bằng Personal Access Token (PAT)
ipcMain.handle('auth:login-token', async (_, token) => {
  if (!token || !token.trim()) {
    return { success: false, error: 'Vui lòng nhập token' };
  }

  const cleanToken = token.trim();
  const val = await validateToken(cleanToken);

  if (!val.valid) {
    return { success: false, error: val.error };
  }

  currentAuth = { token: cleanToken, user: val.user };
  saveAuthToken(app.getPath('userData'), cleanToken, val.user, safeStorage);

  return {
    success: true,
    user: val.user,
    scopes: val.scopes,
    isFineGrained: val.isFineGrained,
    isScopeSufficient: val.isScopeSufficient
  };
});

// Nhập phiên từ GitHub CLI (1-Click cho máy dev)
ipcMain.handle('auth:login-import-gh', async () => {
  return new Promise((resolve) => {
    exec('gh auth token', async (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        return resolve({ success: false, error: 'Không tìm thấy phiên đăng nhập từ GitHub CLI (gh auth)' });
      }

      const token = stdout.trim();
      const val = await validateToken(token);

      if (!val.valid) {
        return resolve({ success: false, error: val.error });
      }

      currentAuth = { token, user: val.user };
      saveAuthToken(app.getPath('userData'), token, val.user, safeStorage);
      resolve({ success: true, user: val.user });
    });
  });
});

// Bắt đầu OAuth Device Flow
ipcMain.handle('auth:device-flow-start', async () => {
  return await startDeviceFlow();
});

// Polling kết quả OAuth Device Flow
ipcMain.handle('auth:device-flow-poll', async (_, deviceCode) => {
  const pollRes = await pollDeviceFlow(deviceCode);

  if (pollRes.status === 'granted' && pollRes.accessToken) {
    const val = await validateToken(pollRes.accessToken);
    if (val.valid) {
      currentAuth = { token: pollRes.accessToken, user: val.user };
      saveAuthToken(app.getPath('userData'), pollRes.accessToken, val.user, safeStorage);
      return { status: 'granted', user: val.user };
    }
    return { status: 'error', error: 'Token cấp không hợp lệ' };
  }

  return pollRes;
});

// Đăng xuất (Logout)
ipcMain.handle('auth:logout', async () => {
  clearAuthToken(app.getPath('userData'));
  currentAuth = null;
  return { success: true };
});

// ==============================================================================
// SYSTEM & REPOSITORIES IPC HANDLERS
// ==============================================================================

// Lấy thông tin hệ thống
ipcMain.handle('app:get-system-info', async () => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);

  return {
    platform: isWindows ? 'Windows (WSL2)' : (isMac ? 'macOS (Unix)' : 'Linux'),
    arch: os.arch(),
    totalMem,
    freeMem,
    loggedIn: !!(currentAuth && currentAuth.token),
    user: currentAuth?.user || null
  };
});

// Lấy danh sách Repos (ưu tiên native GitHub API qua auth token)
ipcMain.handle('app:fetch-repos', async () => {
  if (currentAuth && currentAuth.token) {
    const res = await fetchUserReposWithToken(currentAuth.token, 100);
    if (res.success) return res;
  }

  // Fallback qua gh CLI nếu có
  return new Promise((resolve) => {
    const cmd = 'gh repo list --limit 100 --json nameWithOwner,description,isPrivate,updatedAt';
    exec(cmd, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout, stderr) => {
      if (err) {
        return resolve({ success: false, error: stderr || err.message, repos: [] });
      }
      try {
        const repos = JSON.parse(stdout);
        resolve({ success: true, repos });
      } catch (e) {
        resolve({ success: false, error: 'JSON Parse Error: ' + e.message, repos: [] });
      }
    });
  });
});

// Lấy danh sách Runners cục bộ đã cài đặt trên WSL/Linux
ipcMain.handle('app:get-local-runners', async () => {
  const isWindows = process.platform === 'win32';
  if (!isWindows) return [];

  return new Promise((resolve) => {
    const cmd = `wsl.exe -d Ubuntu -u root --exec bash -c "ls -d /opt/actions-runner* 2>/dev/null"`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) return resolve([]);
      const dirs = stdout.trim().split('\n').map(d => d.trim().replace('/opt/actions-runner-', '').replace('/opt/actions-runner', 'caevietnam.vn'));
      resolve(dirs);
    });
  });
});

// Kiểm tra trạng thái Runner của 1 repo trên GitHub (hỗ trợ cả token trực tiếp)
ipcMain.handle('app:check-runner-status', async (_, repoFullName) => {
  if (currentAuth && currentAuth.token) {
    try {
      const res = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runners`, {
        headers: {
          'Authorization': `Bearer ${currentAuth.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitRunnerHub'
        }
      });
      if (res.ok) {
        const data = await res.json();
        const runners = (data.runners || []).map(r => ({
          id: r.id,
          name: r.name,
          status: r.status,
          busy: !!r.busy
        }));
        const onlineRunner = runners.find(r => r.status === 'online');
        return {
          hasRunner: runners.length > 0,
          isOnline: !!onlineRunner,
          runnerName: onlineRunner ? onlineRunner.name : (runners[0]?.name || null),
          runners
        };
      }
    } catch (e) {
      console.warn('Direct runner check error:', e.message);
    }
  }

  // Fallback gh CLI
  return new Promise((resolve) => {
    const cmd = `gh api "repos/${repoFullName}/actions/runners" --jq '.runners[] | {id, name, status, busy}'`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        return resolve({ hasRunner: false, isOnline: false, runners: [] });
      }
      try {
        const lines = stdout.trim().split('\n');
        const runners = lines.map(line => JSON.parse(line));
        const onlineRunner = runners.find(r => r.status === 'online');
        resolve({
          hasRunner: runners.length > 0,
          isOnline: !!onlineRunner,
          runnerName: onlineRunner ? onlineRunner.name : (runners[0]?.name || null),
          runners
        });
      } catch (e) {
        resolve({ hasRunner: false, isOnline: false, runners: [] });
      }
    });
  });
});

// Thiết lập Runner (1-Click Setup)
ipcMain.handle('app:setup-runner', async (event, repoFullName) => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  event.sender.send('runner:log', `> [1/4] Đang lấy Registration Token từ GitHub API cho ${repoFullName}...\n`);

  // Bước 1: Lấy Token trực tiếp qua HTTP fetch (hoặc fallback gh CLI)
  let regToken = null;

  if (currentAuth && currentAuth.token) {
    try {
      const tokenRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runners/registration-token`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${currentAuth.token}`,
          'Accept': 'application/vnd.github.v3+json',
          'User-Agent': 'GitRunnerHub'
        }
      });
      if (tokenRes.ok) {
        const data = await tokenRes.json();
        regToken = data.token;
      }
    } catch (e) {
      console.warn('Fetch reg token error, trying CLI fallback:', e.message);
    }
  }

  if (!regToken) {
    regToken = await new Promise((res) => {
      const tokenCmd = `gh api --method POST "repos/${repoFullName}/actions/runners/registration-token" --jq .token`;
      exec(tokenCmd, (err, stdout) => {
        if (err || !stdout.trim() || stdout.includes('null')) {
          res(null);
        } else {
          res(stdout.trim());
        }
      });
    });
  }

  if (!regToken) {
    event.sender.send('runner:log', `❌ Lỗi: Không thể lấy token đăng ký từ GitHub. Hãy kiểm tra quyền truy cập repo!\n`);
    return { success: false, exitCode: 1 };
  }

  event.sender.send('runner:log', `> [2/4] Token hợp lệ: ${regToken.substring(0, 6)}******. Đang nạp script cài đặt...\n`);

  const scriptFileName = isMac ? 'runner-setup-mac.sh' : 'runner-setup-linux.sh';
  let scriptContent = '';
  try {
    const scriptPath = path.join(__dirname, '../../scripts', scriptFileName);
    scriptContent = fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n');
  } catch (err) {
    event.sender.send('runner:log', `❌ Lỗi đọc script: ${err.message}\n`);
    return { success: false, exitCode: 1 };
  }

  // Bước 3: Đẩy script và tham số vào môi trường đích
  return new Promise((resolve) => {
    if (isWindows) {
      const writeProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '-c', 'cat > /tmp/git-runner-setup.sh && chmod +x /tmp/git-runner-setup.sh']);
      writeProc.stdin.write(scriptContent);
      writeProc.stdin.end();

      writeProc.on('close', (writeCode) => {
        if (writeCode !== 0) {
          event.sender.send('runner:log', `❌ Lỗi ghi file tạm vào WSL (mã: ${writeCode})\n`);
          return resolve({ success: false, exitCode: writeCode });
        }

        event.sender.send('runner:log', `> [3/4] Đang thực thi cài đặt runner trong WSL2 Ubuntu...\n`);

        const execProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '/tmp/git-runner-setup.sh', repoFullName, regToken]);

        execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
        execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

        execProc.on('close', (code) => {
          resolve({ success: code === 0, exitCode: code });
        });
      });
    } else {
      const tmpPath = '/tmp/git-runner-setup.sh';
      fs.writeFileSync(tmpPath, scriptContent, { mode: 0o755 });

      event.sender.send('runner:log', `> [3/4] Đang thực thi cấu hình runner native...\n`);
      const execProc = spawn('bash', [tmpPath, repoFullName, regToken]);

      execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
      execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

      execProc.on('close', (code) => {
        resolve({ success: code === 0, exitCode: code });
      });
    }
  });
});

// Mở link trình duyệt ngoài
ipcMain.handle('app:open-external', async (_, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});

// Điều khiển Lifecycle Runner
ipcMain.handle('app:lifecycle-runner', async (event, { action, repoFullName }) => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  event.sender.send('runner:log', `> [Lifecycle] Thực hiện '${action}' cho ${repoFullName}...\n`);

  let removeToken = '';
  if (action === 'detach') {
    if (currentAuth && currentAuth.token) {
      try {
        const rRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runners/remove-token`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${currentAuth.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitRunnerHub'
          }
        });
        if (rRes.ok) {
          const rData = await rRes.json();
          removeToken = rData.token;
        }
      } catch (e) {
        console.warn('Fetch remove token error:', e.message);
      }
    }

    if (!removeToken) {
      removeToken = await new Promise((res) => {
        const tokenCmd = `gh api --method POST "repos/${repoFullName}/actions/runners/remove-token" --jq .token`;
        exec(tokenCmd, (err, stdout) => {
          if (err || !stdout.trim() || stdout.includes('null')) res('');
          else res(stdout.trim());
        });
      });
    }
  }

  const scriptFileName = isMac ? 'runner-lifecycle-mac.sh' : 'runner-lifecycle-linux.sh';
  let scriptContent = '';
  try {
    const scriptPath = path.join(__dirname, '../../scripts', scriptFileName);
    scriptContent = fs.readFileSync(scriptPath, 'utf8').replace(/\r\n/g, '\n');
  } catch (err) {
    event.sender.send('runner:log', `❌ Lỗi đọc script: ${err.message}\n`);
    return { success: false, exitCode: 1 };
  }

  return new Promise((resolve) => {
    if (isWindows) {
      const writeProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '-c', 'cat > /tmp/git-runner-lifecycle.sh && chmod +x /tmp/git-runner-lifecycle.sh']);
      writeProc.stdin.write(scriptContent);
      writeProc.stdin.end();

      writeProc.on('close', (writeCode) => {
        if (writeCode !== 0) {
          event.sender.send('runner:log', `❌ Lỗi ghi file lifecycle vào WSL (mã: ${writeCode})\n`);
          return resolve({ success: false, exitCode: writeCode });
        }

        const execProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '/tmp/git-runner-lifecycle.sh', action, repoFullName, removeToken]);

        execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
        execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

        execProc.on('close', (code) => {
          resolve({ success: code === 0, exitCode: code });
        });
      });
    } else {
      const tmpPath = '/tmp/git-runner-lifecycle.sh';
      fs.writeFileSync(tmpPath, scriptContent, { mode: 0o755 });
      const execProc = spawn('bash', [tmpPath, action, repoFullName, removeToken]);

      execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
      execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

      execProc.on('close', (code) => {
        resolve({ success: code === 0, exitCode: code });
      });
    }
  });
});
