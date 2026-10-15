/**
 * GitRunnerHub Core - Authentication & Identity Management [GRH-201..204]
 * Supports: GitHub OAuth Device Flow, Personal Access Token (PAT), CLI Token Import
 */

const fs = require('fs');
const path = require('path');

// GitHub Official CLI OAuth Client ID (Public client ID for Device Flow)
const GITHUB_CLIENT_ID = '178c6fc77837768e9226';

function parseScopes(scopeHeader) {
  if (!scopeHeader || typeof scopeHeader !== 'string') return [];
  return scopeHeader.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
}

function isScopeSufficient(scopeHeader, isFineGrained = false) {
  if (isFineGrained) return true;
  const scopes = parseScopes(scopeHeader);
  // Cần quyền 'repo' để quản lý actions runner và đọc code
  return scopes.includes('repo');
}

function formatUserData(rawUser) {
  if (!rawUser) return null;
  const login = rawUser.login || 'Unknown';
  const name = rawUser.name || login;
  const initials = (name || login).charAt(0).toUpperCase();

  return {
    login,
    name,
    avatarUrl: rawUser.avatar_url || '',
    id: rawUser.id || 0,
    email: rawUser.email || '',
    htmlUrl: rawUser.html_url || `https://github.com/${login}`,
    initials
  };
}

/**
 * Xác thực token trực tiếp với GitHub API
 */
async function validateToken(token) {
  if (!token || typeof token !== 'string') {
    return { valid: false, error: 'Token không hợp lệ' };
  }

  const cleanToken = token.trim();

  try {
    const res = await fetch('https://api.github.com/user', {
      headers: {
        'Authorization': `Bearer ${cleanToken}`,
        'User-Agent': 'GitRunnerHub-Desktop',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (res.status === 401) {
      return { valid: false, error: 'Token không chính xác hoặc đã hết hạn (401 Unauthorized)' };
    }

    if (!res.ok) {
      return { valid: false, error: `GitHub API trả về lỗi: HTTP ${res.status}` };
    }

    const userData = await res.json();
    const scopeHeader = res.headers.get('x-oauth-scopes') || '';
    const isFineGrained = cleanToken.startsWith('github_pat_');
    const sufficient = isScopeSufficient(scopeHeader, isFineGrained);

    return {
      valid: true,
      user: formatUserData(userData),
      scopes: parseScopes(scopeHeader),
      isFineGrained,
      isScopeSufficient: sufficient
    };
  } catch (err) {
    return { valid: false, error: `Lỗi kết nối mạng: ${err.message}` };
  }
}

/**
 * Lấy danh sách repositories của người dùng trực tiếp bằng GitHub API
 */
async function fetchUserReposWithToken(token, limit = 100) {
  if (!token) return { success: false, error: 'Chưa có token', repos: [] };

  try {
    const res = await fetch(`https://api.github.com/user/repos?per_page=${limit}&sort=updated`, {
      headers: {
        'Authorization': `Bearer ${token.trim()}`,
        'User-Agent': 'GitRunnerHub-Desktop',
        'Accept': 'application/vnd.github.v3+json'
      }
    });

    if (!res.ok) {
      return { success: false, error: `HTTP ${res.status}`, repos: [] };
    }

    const rawRepos = await res.json();
    const repos = rawRepos.map(r => ({
      nameWithOwner: r.full_name,
      description: r.description || '',
      isPrivate: !!r.private,
      updatedAt: r.updated_at
    }));

    return { success: true, repos };
  } catch (err) {
    return { success: false, error: err.message, repos: [] };
  }
}

/**
 * Bắt đầu GitHub Device Authorization Flow
 */
async function startDeviceFlow(clientId = GITHUB_CLIENT_ID) {
  try {
    const res = await fetch('https://github.com/login/device/code', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        scope: 'repo,workflow,read:org'
      })
    });

    if (!res.ok) {
      throw new Error(`Device code request failed: HTTP ${res.status}`);
    }

    const data = await res.json();
    return {
      success: true,
      deviceCode: data.device_code,
      userCode: data.user_code,
      verificationUri: data.verification_uri,
      expiresIn: data.expires_in,
      interval: data.interval || 5
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

/**
 * Poll access token trong Device Authorization Flow
 */
async function pollDeviceFlow(deviceCode, clientId = GITHUB_CLIENT_ID) {
  try {
    const res = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        client_id: clientId,
        device_code: deviceCode,
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code'
      })
    });

    const data = await res.json();

    if (data.access_token) {
      return { status: 'granted', accessToken: data.access_token };
    }

    if (data.error === 'authorization_pending') {
      return { status: 'pending' };
    }

    if (data.error === 'slow_down') {
      return { status: 'slow_down', interval: (data.interval || 5) };
    }

    if (data.error === 'expired_token') {
      return { status: 'expired', error: 'Mã xác thực đã hết hạn' };
    }

    if (data.error === 'access_denied') {
      return { status: 'denied', error: 'Người dùng đã từ chối cấp quyền' };
    }

    return { status: 'error', error: data.error_description || data.error };
  } catch (err) {
    return { status: 'error', error: err.message };
  }
}

/**
 * Lưu trữ hoặc cập nhật một tài khoản vào kho đa tài khoản (auth-accounts.json)
 */
function saveAccount(userDataDir, token, user, safeStorage = null) {
  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Cannot create userData dir:', e.message);
  }

  const filePath = path.join(userDataDir, 'auth-accounts.json');
  let store = { activeAccount: null, accounts: {} };

  // Đọc store hiện có nếu có
  if (fs.existsSync(filePath)) {
    try {
      store = JSON.parse(fs.readFileSync(filePath, 'utf8')) || store;
      if (!store.accounts) store.accounts = {};
    } catch (e) {
      console.warn('Corrupt auth-accounts.json, resetting store');
    }
  } else {
    // Migration từ auth-session.json cũ nếu có
    const legacyPath = path.join(userDataDir, 'auth-session.json');
    if (fs.existsSync(legacyPath)) {
      try {
        const legacy = JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
        if (legacy && legacy.token && legacy.user && legacy.user.login) {
          store.accounts[legacy.user.login] = {
            login: legacy.user.login,
            name: legacy.user.name || legacy.user.login,
            avatarUrl: legacy.user.avatarUrl || '',
            token: legacy.token,
            isEncrypted: !!legacy.isEncrypted,
            addedAt: legacy.updatedAt || new Date().toISOString()
          };
          store.activeAccount = legacy.user.login;
        }
      } catch (e) {}
    }
  }

  let tokenData = token;
  let isEncrypted = false;

  if (safeStorage && typeof safeStorage.isEncryptionAvailable === 'function' && safeStorage.isEncryptionAvailable()) {
    try {
      tokenData = safeStorage.encryptString(token).toString('base64');
      isEncrypted = true;
    } catch (e) {
      console.warn('safeStorage encryption failed, falling back:', e.message);
    }
  }

  const login = user?.login || 'unknown_user';
  store.accounts[login] = {
    login,
    name: user?.name || login,
    avatarUrl: user?.avatarUrl || '',
    id: user?.id || 0,
    email: user?.email || '',
    htmlUrl: user?.htmlUrl || `https://github.com/${login}`,
    token: tokenData,
    isEncrypted,
    addedAt: new Date().toISOString()
  };

  store.activeAccount = login;

  fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');

  // Đồng bộ sang legacy file để các module khác tương thích
  try {
    fs.writeFileSync(
      path.join(userDataDir, 'auth-session.json'),
      JSON.stringify({ token: tokenData, isEncrypted, user, updatedAt: new Date().toISOString() }, null, 2),
      'utf8'
    );
  } catch (e) {}

  return true;
}

/**
 * Lấy tài khoản đang active hiện tại (kèm token đã giải mã)
 */
function getActiveAccount(userDataDir, safeStorage = null) {
  const filePath = path.join(userDataDir, 'auth-accounts.json');
  let store = null;

  if (fs.existsSync(filePath)) {
    try {
      store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    } catch (e) {}
  }

  // Fallback từ legacy nếu store chưa có
  if (!store || !store.accounts || Object.keys(store.accounts).length === 0) {
    const legacy = loadLegacyAuthToken(userDataDir, safeStorage);
    if (legacy && legacy.user) {
      return legacy;
    }
    return null;
  }

  const activeLogin = store.activeAccount || Object.keys(store.accounts)[0];
  const acc = store.accounts[activeLogin];
  if (!acc) return null;

  let token = acc.token;
  if (acc.isEncrypted && safeStorage && typeof safeStorage.decryptString === 'function') {
    try {
      const buffer = Buffer.from(token, 'base64');
      token = safeStorage.decryptString(buffer);
    } catch (e) {
      console.warn('Failed to decrypt token for account:', acc.login);
    }
  }

  return {
    token,
    user: {
      login: acc.login,
      name: acc.name,
      avatarUrl: acc.avatarUrl,
      id: acc.id,
      email: acc.email,
      htmlUrl: acc.htmlUrl,
      initials: (acc.name || acc.login).charAt(0).toUpperCase()
    },
    addedAt: acc.addedAt
  };
}

/**
 * Liệt kê tất cả tài khoản đã kết nối (không kèm token vì lý do bảo mật)
 */
function listAccounts(userDataDir) {
  const filePath = path.join(userDataDir, 'auth-accounts.json');
  if (!fs.existsSync(filePath)) {
    const legacy = loadLegacyAuthToken(userDataDir, null);
    if (legacy && legacy.user) {
      return [{ ...legacy.user, isActive: true }];
    }
    return [];
  }

  try {
    const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const accounts = store.accounts || {};
    const activeLogin = store.activeAccount;

    return Object.values(accounts).map(acc => ({
      login: acc.login,
      name: acc.name,
      avatarUrl: acc.avatarUrl,
      id: acc.id,
      email: acc.email,
      htmlUrl: acc.htmlUrl,
      isActive: acc.login === activeLogin,
      addedAt: acc.addedAt
    }));
  } catch (e) {
    return [];
  }
}

/**
 * Chuyển tài khoản active sang một tài khoản khác
 */
function switchAccount(userDataDir, targetLogin) {
  const filePath = path.join(userDataDir, 'auth-accounts.json');
  if (!fs.existsSync(filePath)) return false;

  try {
    const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!store.accounts || !store.accounts[targetLogin]) {
      return false;
    }
    store.activeAccount = targetLogin;
    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');

    // Đồng bộ sang legacy file
    const acc = store.accounts[targetLogin];
    try {
      fs.writeFileSync(
        path.join(userDataDir, 'auth-session.json'),
        JSON.stringify({
          token: acc.token,
          isEncrypted: acc.isEncrypted,
          user: {
            login: acc.login,
            name: acc.name,
            avatarUrl: acc.avatarUrl,
            id: acc.id,
            email: acc.email,
            htmlUrl: acc.htmlUrl
          },
          updatedAt: new Date().toISOString()
        }, null, 2),
        'utf8'
      );
    } catch (e) {}

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Xóa một tài khoản khỏi danh sách
 */
function removeAccount(userDataDir, targetLogin) {
  const filePath = path.join(userDataDir, 'auth-accounts.json');
  if (!fs.existsSync(filePath)) return false;

  try {
    const store = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!store.accounts || !store.accounts[targetLogin]) return false;

    delete store.accounts[targetLogin];

    const remainingLogins = Object.keys(store.accounts);
    if (store.activeAccount === targetLogin) {
      store.activeAccount = remainingLogins.length > 0 ? remainingLogins[0] : null;
    }

    fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf8');

    // Cập nhật legacy
    if (store.activeAccount) {
      const activeAcc = store.accounts[store.activeAccount];
      fs.writeFileSync(
        path.join(userDataDir, 'auth-session.json'),
        JSON.stringify({
          token: activeAcc.token,
          isEncrypted: activeAcc.isEncrypted,
          user: activeAcc,
          updatedAt: new Date().toISOString()
        }, null, 2),
        'utf8'
      );
    } else {
      try { fs.unlinkSync(path.join(userDataDir, 'auth-session.json')); } catch (e) {}
    }

    return true;
  } catch (e) {
    return false;
  }
}

/**
 * Xóa toàn bộ tài khoản (Full Logout)
 */
function clearAllAccounts(userDataDir) {
  try {
    const p1 = path.join(userDataDir, 'auth-accounts.json');
    const p2 = path.join(userDataDir, 'auth-session.json');
    if (fs.existsSync(p1)) fs.unlinkSync(p1);
    if (fs.existsSync(p2)) fs.unlinkSync(p2);
    return true;
  } catch (e) {
    return false;
  }
}

function loadLegacyAuthToken(userDataDir, safeStorage = null) {
  const filePath = path.join(userDataDir, 'auth-session.json');
  if (!fs.existsSync(filePath)) return null;

  try {
    const raw = fs.readFileSync(filePath, 'utf8');
    const payload = JSON.parse(raw);
    let token = payload.token;

    if (payload.isEncrypted && safeStorage && typeof safeStorage.decryptString === 'function') {
      const buffer = Buffer.from(token, 'base64');
      token = safeStorage.decryptString(buffer);
    }

    return {
      token,
      user: payload.user,
      updatedAt: payload.updatedAt
    };
  } catch (err) {
    return null;
  }
}

// Backward-compatible wrappers
function saveAuthToken(userDataDir, token, user, safeStorage = null) {
  return saveAccount(userDataDir, token, user, safeStorage);
}

function loadAuthToken(userDataDir, safeStorage = null) {
  return getActiveAccount(userDataDir, safeStorage);
}

function clearAuthToken(userDataDir) {
  return clearAllAccounts(userDataDir);
}

module.exports = {
  GITHUB_CLIENT_ID,
  parseScopes,
  isScopeSufficient,
  formatUserData,
  validateToken,
  fetchUserReposWithToken,
  startDeviceFlow,
  pollDeviceFlow,
  saveAuthToken,
  loadAuthToken,
  clearAuthToken,
  saveAccount,
  getActiveAccount,
  listAccounts,
  switchAccount,
  removeAccount,
  clearAllAccounts
};

