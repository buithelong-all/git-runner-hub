/**
 * GitRunnerHub Core - Security & Risk Assessment [GRH-150..155]
 */

// Regex phát hiện các dạng token GitHub và secret phổ biến
const SECRET_PATTERNS = [
  /ghp_[a-zA-Z0-9]{36}/g,
  /gho_[a-zA-Z0-9]{36}/g,
  /github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g,
  /[A-Z0-9]{29,32}/g // GitHub registration tokens
];

function redactSecrets(text) {
  if (!text || typeof text !== 'string') return text;
  let sanitized = text;
  
  // Ẩn Registration Token hoặc Personal Access Token
  sanitized = sanitized.replace(/(token\s*['":=]+)[a-zA-Z0-9_-]{20,}/gi, '$1[REDACTED]');
  sanitized = sanitized.replace(/(bearer\s+)[a-zA-Z0-9_.-]{20,}/gi, '$1[REDACTED]');
  
  SECRET_PATTERNS.forEach(pattern => {
    sanitized = sanitized.replace(pattern, (match) => {
      return match.substring(0, 4) + '...' + '[REDACTED]';
    });
  });

  return sanitized;
}

function classifyRepoSecurity(isPrivate) {
  if (isPrivate) {
    return {
      status: 'SAFE',
      level: 'low',
      allowForkPRs: true,
      message: 'Private repository: Quyền truy cập mã nguồn được kiểm soát nội bộ.'
    };
  }

  return {
    status: 'WARNING',
    level: 'high',
    allowForkPRs: false,
    message: 'Public repository: Nguy cơ thực thi mã độc từ PR/fork ngoài. Chặn PR tự động trên persistent runner theo mặc định.'
  };
}

module.exports = {
  redactSecrets,
  classifyRepoSecurity
};
