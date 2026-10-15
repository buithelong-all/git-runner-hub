/**
 * GitRunnerHub Local HTTP Server & Web Preview Bridge
 * Runs on http://localhost:3000
 * Serves renderer UI and connects to native GitHub REST APIs & WSL2 runner lifecycle
 */

const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { exec, spawn } = require('child_process');

const {
  validateToken,
  fetchUserReposWithToken,
  startDeviceFlow,
  pollDeviceFlow,
  saveAuthToken,
  loadAuthToken,
  clearAuthToken
} = require('./src/core/auth');

const PORT = process.env.PORT || 3000;
const RENDERER_DIR = path.join(__dirname, 'src', 'renderer');
const USER_DATA_DIR = path.join(os.homedir(), '.git-runner-hub');

let currentAuth = null;
try {
  currentAuth = loadAuthToken(USER_DATA_DIR, null);
} catch (e) {
  console.warn('Cannot load stored auth:', e.message);
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function sendJson(res, data, statusCode = 200) {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type'
  });
  res.end(JSON.stringify(data));
}

function parseBody(req) {
  return new Promise((resolve) => {
    let body = '';
    req.on('data', chunk => { body += chunk.toString(); });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (e) {
        resolve({});
      }
    });
  });
}

const server = http.createServer(async (req, res) => {
  const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = parsedUrl.pathname;

  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.writeHead(204, {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type'
    });
    return res.end();
  }

  // ============================================================================
  // REST API ENDPOINTS
  // ============================================================================

  if (pathname === '/api/system-info' && req.method === 'GET') {
    return sendJson(res, {
      platform: 'Windows (WSL2) — Web Live Mode',
      arch: os.arch(),
      totalMem: (os.totalmem() / 1024 / 1024 / 1024).toFixed(1),
      freeMem: (os.freemem() / 1024 / 1024 / 1024).toFixed(1),
      loggedIn: !!(currentAuth && currentAuth.token),
      user: currentAuth?.user || null
    });
  }

  if (pathname === '/api/auth/current-user' && req.method === 'GET') {
    if (currentAuth && currentAuth.token) {
      return sendJson(res, { loggedIn: true, user: currentAuth.user, method: 'stored' });
    }

    // Fallback qua gh CLI nếu có
    return exec('gh auth token', async (err, stdout) => {
      if (!err && stdout && stdout.trim()) {
        const ghToken = stdout.trim();
        const val = await validateToken(ghToken);
        if (val.valid) {
          currentAuth = { token: ghToken, user: val.user };
          saveAuthToken(USER_DATA_DIR, ghToken, val.user, null);
          return sendJson(res, { loggedIn: true, user: val.user, method: 'gh-cli' });
        }
      }
      sendJson(res, { loggedIn: false, user: null });
    });
  }

  if (pathname === '/api/auth/login-token' && req.method === 'POST') {
    const { token } = await parseBody(req);
    if (!token || !token.trim()) {
      return sendJson(res, { success: false, error: 'Vui lòng nhập token' }, 400);
    }
    const cleanToken = token.trim();
    const val = await validateToken(cleanToken);
    if (!val.valid) {
      return sendJson(res, { success: false, error: val.error });
    }
    currentAuth = { token: cleanToken, user: val.user };
    saveAuthToken(USER_DATA_DIR, cleanToken, val.user, null);
    return sendJson(res, { success: true, user: val.user, scopes: val.scopes });
  }

  if (pathname === '/api/auth/login-gh' && req.method === 'POST') {
    exec('gh auth token', async (err, stdout) => {
      if (err || !stdout || !stdout.trim()) {
        return sendJson(res, { success: false, error: 'Không tìm thấy phiên đăng nhập GitHub CLI ngoài máy' });
      }
      const token = stdout.trim();
      const val = await validateToken(token);
      if (!val.valid) {
        return sendJson(res, { success: false, error: val.error });
      }
      currentAuth = { token, user: val.user };
      saveAuthToken(USER_DATA_DIR, token, val.user, null);
      sendJson(res, { success: true, user: val.user });
    });
    return;
  }

  if (pathname === '/api/auth/device-start' && req.method === 'POST') {
    const data = await startDeviceFlow();
    return sendJson(res, data);
  }

  if (pathname === '/api/auth/device-poll' && req.method === 'POST') {
    const { deviceCode } = await parseBody(req);
    const pollRes = await pollDeviceFlow(deviceCode);
    if (pollRes.status === 'granted' && pollRes.accessToken) {
      const val = await validateToken(pollRes.accessToken);
      if (val.valid) {
        currentAuth = { token: pollRes.accessToken, user: val.user };
        saveAuthToken(USER_DATA_DIR, pollRes.accessToken, val.user, null);
        return sendJson(res, { status: 'granted', user: val.user });
      }
    }
    return sendJson(res, pollRes);
  }

  if (pathname === '/api/auth/logout' && req.method === 'POST') {
    clearAuthToken(USER_DATA_DIR);
    currentAuth = null;
    return sendJson(res, { success: true });
  }

  if (pathname === '/api/repos' && req.method === 'GET') {
    if (currentAuth && currentAuth.token) {
      const result = await fetchUserReposWithToken(currentAuth.token, 100);
      if (result.success) return sendJson(res, result);
    }

    exec('gh repo list --limit 100 --json nameWithOwner,description,isPrivate,updatedAt', (err, stdout) => {
      if (!err && stdout.trim()) {
        try {
          const repos = JSON.parse(stdout);
          return sendJson(res, { success: true, repos });
        } catch (e) {}
      }
      // Mock repos fallback
      sendJson(res, {
        success: true,
        repos: [
          { nameWithOwner: 'buithelong-all/DanhTinh-Lab', description: 'Nền tảng kiểm định và tự động hóa hồ sơ danh tính', isPrivate: true, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/caevietnam.vn', description: 'Cổng thông tin chuyên ngành CAE & mô phỏng', isPrivate: false, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/git-runner-hub', description: '1-Click GitHub Actions Self-Hosted Runner Manager', isPrivate: false, updatedAt: new Date().toISOString() },
          { nameWithOwner: 'buithelong-all/kungfutalk-monorepo', description: 'Hệ sinh thái học máy và đàm thoại ngoại ngữ', isPrivate: true, updatedAt: new Date().toISOString() }
        ]
      });
    });
    return;
  }

  if (pathname === '/api/local-runners' && req.method === 'GET') {
    exec(`wsl.exe -d Ubuntu -u root --exec bash -c "ls -d /opt/actions-runner* 2>/dev/null"`, (err, stdout) => {
      if (err || !stdout.trim()) {
        return sendJson(res, ['DanhTinh-Lab', 'caevietnam.vn']);
      }
      const dirs = stdout.trim().split('\n').map(d => d.trim().replace('/opt/actions-runner-', '').replace('/opt/actions-runner', 'caevietnam.vn'));
      sendJson(res, dirs);
    });
    return;
  }

  if (pathname === '/api/runner/status' && req.method === 'GET') {
    const repoFullName = parsedUrl.searchParams.get('repo');
    if (!repoFullName) return sendJson(res, { hasRunner: false, isOnline: false, runners: [] });

    if (currentAuth && currentAuth.token) {
      try {
        const fetchRes = await fetch(`https://api.github.com/repos/${repoFullName}/actions/runners`, {
          headers: {
            'Authorization': `Bearer ${currentAuth.token}`,
            'Accept': 'application/vnd.github.v3+json',
            'User-Agent': 'GitRunnerHub'
          }
        });
        if (fetchRes.ok) {
          const data = await fetchRes.json();
          const runners = (data.runners || []).map(r => ({
            id: r.id,
            name: r.name,
            status: r.status,
            busy: !!r.busy
          }));
          const onlineRunner = runners.find(r => r.status === 'online');
          return sendJson(res, {
            hasRunner: runners.length > 0,
            isOnline: !!onlineRunner,
            runnerName: onlineRunner ? onlineRunner.name : (runners[0]?.name || null),
            runners
          });
        }
      } catch (e) {}
    }

    exec(`gh api "repos/${repoFullName}/actions/runners" --jq '.runners[] | {id, name, status, busy}'`, (err, stdout) => {
      if (err || !stdout.trim()) {
        return sendJson(res, { hasRunner: false, isOnline: false, runners: [] });
      }
      try {
        const lines = stdout.trim().split('\n');
        const runners = lines.map(l => JSON.parse(l));
        const online = runners.find(r => r.status === 'online');
        sendJson(res, {
          hasRunner: runners.length > 0,
          isOnline: !!online,
          runnerName: online ? online.name : null,
          runners
        });
      } catch (e) {
        sendJson(res, { hasRunner: false, isOnline: false, runners: [] });
      }
    });
    return;
  }

  // ============================================================================
  // STATIC FILE SERVING (src/renderer)
  // ============================================================================

  let safePath = path.normalize(pathname).replace(/^(\.\.[\/\\])+/, '');
  if (safePath === '/' || safePath === '\\') safePath = '/index.html';

  const filePath = path.join(RENDERER_DIR, safePath);

  if (!filePath.startsWith(RENDERER_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      return res.end('File not found: ' + pathname);
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, { 'Content-Type': contentType });
    const stream = fs.createReadStream(filePath);
    stream.pipe(res);
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`⚡ GitRunnerHub Server is listening on http://localhost:${PORT}`);
  console.log(`🌐 Local Network Access: http://127.0.0.1:${PORT}`);
});
