const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const os = require('os');
const { isValidRepo } = require('../core/repo');

let mainWindow;

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
}

app.whenReady().then(() => {
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

// IPC Handler: Lấy thông tin hệ thống & GitHub CLI status
ipcMain.handle('app:get-system-info', async () => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';
  const totalMem = (os.totalmem() / 1024 / 1024 / 1024).toFixed(1);
  const freeMem = (os.freemem() / 1024 / 1024 / 1024).toFixed(1);

  return new Promise((resolve) => {
    exec('gh auth status', (err, stdout, stderr) => {
      const ghOutput = (stdout || '') + (stderr || '');
      const loggedIn = !err && ghOutput.includes('Logged in to github.com');
      
      let account = 'Unknown';
      const match = ghOutput.match(/account\s+([a-zA-Z0-9_-]+)/i);
      if (match) account = match[1];

      resolve({
        platform: isWindows ? 'Windows (WSL2)' : (isMac ? 'macOS (Unix)' : 'Linux'),
        arch: os.arch(),
        totalMem,
        freeMem,
        ghLoggedIn: loggedIn,
        ghAccount: account
      });
    });
  });
});

// IPC Handler: Lấy danh sách Repos từ GitHub qua gh CLI
ipcMain.handle('app:fetch-repos', async () => {
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

// IPC Handler: Lấy danh sách Runners cục bộ đã cài đặt trên WSL/Linux
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

// IPC Handler: Kiểm tra trạng thái Runner của 1 repo trên GitHub
ipcMain.handle('app:check-runner-status', async (_, repoFullName) => {
  if (!isValidRepo(repoFullName)) return { hasRunner: false, isOnline: false, runners: [] };
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

// IPC Handler: Thiết lập Runner (1-Click Setup) — Độc lập với ASAR
ipcMain.handle('app:setup-runner', async (event, repoFullName) => {
  if (!isValidRepo(repoFullName)) return { success: false, exitCode: 2, error: 'INVALID_REPOSITORY' };
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  event.sender.send('runner:log', `> [1/4] Đang lấy Registration Token từ GitHub API cho ${repoFullName}...\n`);

  // Bước 1: Lấy Token trực tiếp trên Host qua GitHub CLI
  const regToken = await new Promise((res) => {
    const tokenCmd = `gh api --method POST "repos/${repoFullName}/actions/runners/registration-token" --jq .token`;
    exec(tokenCmd, (err, stdout) => {
      if (err || !stdout.trim() || stdout.includes('null')) {
        res(null);
      } else {
        res(stdout.trim());
      }
    });
  });

  if (!regToken) {
    event.sender.send('runner:log', `❌ Lỗi: Không thể lấy token đăng ký từ GitHub. Hãy kiểm tra quyền truy cập repo!\n`);
    return { success: false, exitCode: 1 };
  }

  event.sender.send('runner:log', `> [2/4] Đã lấy registration token (không ghi log token). Đang nạp script cài đặt...\n`);

  // Bước 2: Đọc nội dung script bằng Node fs (hoạt động hoàn hảo cả dev lẫn trong packaged app.asar)
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
      // Viết script sang /tmp trên WSL bằng stdin để tránh hoàn toàn lỗi asar file path
      const writeProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '-c', 'install -d -m 0700 /run/gitrunnerhub && cat > /run/gitrunnerhub/runner-setup.sh && chmod 0700 /run/gitrunnerhub/runner-setup.sh']);
      writeProc.stdin.write(scriptContent);
      writeProc.stdin.end();

      writeProc.on('close', (writeCode) => {
        if (writeCode !== 0) {
          event.sender.send('runner:log', `❌ Lỗi ghi file tạm vào WSL (mã: ${writeCode})\n`);
          return resolve({ success: false, exitCode: writeCode });
        }

        event.sender.send('runner:log', `> [3/4] Đang thực thi cài đặt runner trong WSL2 Ubuntu...\n`);

        const execProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '/run/gitrunnerhub/runner-setup.sh', repoFullName, '-']);
        execProc.stdin.end(regToken + '\n');

        execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
        execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

        execProc.on('close', (code) => {
          resolve({ success: code === 0, exitCode: code });
        });
      });
    } else {
      // macOS / Linux native
      const tmpPath = '/tmp/git-runner-setup.sh';
      fs.writeFileSync(tmpPath, scriptContent, { mode: 0o755 });

      event.sender.send('runner:log', `> [3/4] Đang thực thi cấu hình runner native...\n`);
      const execProc = isMac ? spawn('bash', [tmpPath, repoFullName, regToken]) : spawn('bash', [tmpPath, repoFullName, '-']);
      if (!isMac) execProc.stdin.end(regToken + '\n');

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

// IPC Handler: Điều khiển Lifecycle Runner (status, start, stop, restart, detach) [GRH-174]
ipcMain.handle('app:lifecycle-runner', async (event, { action, repoFullName }) => {
  if (!isValidRepo(repoFullName) || !['status', 'start', 'stop', 'restart', 'detach'].includes(action)) {
    return { success: false, exitCode: 2, error: 'INVALID_REPOSITORY_OR_ACTION' };
  }
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  event.sender.send('runner:log', `> [Lifecycle] Thực hiện '${action}' cho ${repoFullName}...\n`);

  let removeToken = '';
  if (action === 'detach') {
    // Lấy remove token qua GitHub CLI
    removeToken = await new Promise((res) => {
      const tokenCmd = `gh api --method POST "repos/${repoFullName}/actions/runners/remove-token" --jq .token`;
      exec(tokenCmd, (err, stdout) => {
        if (err || !stdout.trim() || stdout.includes('null')) res('');
        else res(stdout.trim());
      });
    });
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
      const writeProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '-c', 'install -d -m 0700 /run/gitrunnerhub && cat > /run/gitrunnerhub/runner-lifecycle.sh && chmod 0700 /run/gitrunnerhub/runner-lifecycle.sh']);
      writeProc.stdin.write(scriptContent);
      writeProc.stdin.end();

      writeProc.on('close', (writeCode) => {
        if (writeCode !== 0) {
          event.sender.send('runner:log', `❌ Lỗi ghi file lifecycle vào WSL (mã: ${writeCode})\n`);
          return resolve({ success: false, exitCode: writeCode });
        }

        const execProc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', '/run/gitrunnerhub/runner-lifecycle.sh', action, repoFullName, action === 'detach' ? '-' : '']);
        execProc.stdin.end(action === 'detach' ? removeToken + '\n' : '');

        execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
        execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

        execProc.on('close', (code) => {
          resolve({ success: code === 0, exitCode: code });
        });
      });
    } else {
      const tmpPath = '/tmp/git-runner-lifecycle.sh';
      fs.writeFileSync(tmpPath, scriptContent, { mode: 0o755 });
      const execProc = isMac ? spawn('bash', [tmpPath, action, repoFullName, removeToken]) : spawn('bash', [tmpPath, action, repoFullName, action === 'detach' ? '-' : '']);
      if (!isMac) execProc.stdin.end(action === 'detach' ? removeToken + '\n' : '');

      execProc.stdout.on('data', (d) => event.sender.send('runner:log', d.toString()));
      execProc.stderr.on('data', (d) => event.sender.send('runner:log', d.toString()));

      execProc.on('close', (code) => {
        resolve({ success: code === 0, exitCode: code });
      });
    }
  });
});

