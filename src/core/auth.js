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
 * Lưu trữ token an toàn (SafeStorage hoặc file mã hóa)
 */
function saveAuthToken(userDataDir, token, user, safeStorage = null) {
  try {
    if (!fs.existsSync(userDataDir)) {
      fs.mkdirSync(userDataDir, { recursive: true });
    }
  } catch (e) {
    console.warn('Cannot create userData dir:', e.message);
  }

  const filePath = path.join(userDataDir, 'auth-session.json');
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

  const payload = {
    token: tokenData,
    isEncrypted,
    user: user || null,
    updatedAt: new Date().toISOString()
  };

  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2), 'utf8');
  return true;
}

/**
 * Đọc token đã lưu
 */
function loadAuthToken(userDataDir, safeStorage = null) {
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
    console.warn('Load auth token error:', err.message);
    return null;
  }
}

/**
 * Xóa session (Logout)
 */
function clearAuthToken(userDataDir) {
  const filePath = path.join(userDataDir, 'auth-session.json');
  if (fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
      return true;
    } catch (e) {
      return false;
    }
  }
  return true;
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
  clearAuthToken
};
