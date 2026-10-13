const { app, BrowserWindow, ipcMain, shell } = require('electron');
const path = require('path');
const { exec, spawn } = require('child_process');
const os = require('os');

let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1180,
    height: 760,
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

// IPC Handler: Lấy thông tin hệ thống
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
  return new Promise((resolve, reject) => {
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

// IPC Handler: Kiểm tra trạng thái Runner của 1 repo
ipcMain.handle('app:check-runner-status', async (_, repoFullName) => {
  return new Promise((resolve) => {
    const cmd = `gh api "repos/${repoFullName}/actions/runners" --jq '.runners[] | {id, name, status, busy}'`;
    exec(cmd, (err, stdout) => {
      if (err || !stdout.trim()) {
        return resolve({ hasRunner: false, runners: [] });
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
        resolve({ hasRunner: false, runners: [] });
      }
    });
  });
});

// IPC Handler: Thiết lập Runner (1-Click Setup)
ipcMain.handle('app:setup-runner', async (event, repoFullName) => {
  const isWindows = process.platform === 'win32';
  const isMac = process.platform === 'darwin';

  return new Promise((resolve) => {
    let scriptPath;
    let proc;

    if (isWindows) {
      // Gọi WSL2 Ubuntu
      scriptPath = path.join(__dirname, '../../scripts/runner-setup-linux.sh');
      const wslScriptPath = scriptPath.replace(/\\/g, '/').replace(/^([A-Za-z]):/, (_, drive) => `/mnt/${drive.toLowerCase()}`);
      proc = spawn('wsl.exe', ['-d', 'Ubuntu', '-u', 'root', '--exec', 'bash', wslScriptPath, repoFullName]);
    } else if (isMac) {
      // Gọi bash native trên macOS
      scriptPath = path.join(__dirname, '../../scripts/runner-setup-mac.sh');
      proc = spawn('bash', [scriptPath, repoFullName]);
    } else {
      // Linux native
      scriptPath = path.join(__dirname, '../../scripts/runner-setup-linux.sh');
      proc = spawn('sudo', ['bash', scriptPath, repoFullName]);
    }

    proc.stdout.on('data', (data) => {
      event.sender.send('runner:log', data.toString());
    });

    proc.stderr.on('data', (data) => {
      event.sender.send('runner:log', data.toString());
    });

    proc.on('close', (code) => {
      resolve({ success: code === 0, exitCode: code });
    });
  });
});

// Mở link trình duyệt ngoài
ipcMain.handle('app:open-external', async (_, url) => {
  if (url && (url.startsWith('https://') || url.startsWith('http://'))) {
    shell.openExternal(url);
  }
});
