/**
 * GitRunnerHub Core - Concurrency, Evidence & Observability [GRH-160..166]
 */

const fs = require('fs');
const path = require('path');

function createEvidenceRecord({
  repository,
  sha,
  isClean,
  runId = null,
  runnerName = 'local-ci',
  labels = [],
  toolchain = {},
  durationMs = 0,
  exitCode = 0,
  provenanceHash = null
}) {
  return {
    repository,
    sha,
    isClean: !!isClean,
    runId,
    runnerName,
    labels,
    toolchain: {
      node: toolchain.node || process.version,
      pnpm: toolchain.pnpm || 'none',
      os: toolchain.os || process.platform
    },
    durationMs,
    exitCode,
    provenanceHash,
    status: exitCode === 0 ? 'PASS' : 'FAIL',
    timestamp: new Date().toISOString()
  };
}

function classifyFailure(exitCode, logContent = '') {
  if (exitCode === 0) return { type: 'NONE', message: 'Validation thành công.' };

  const log = logContent.toLowerCase();

  if (log.includes('enospc') || log.includes('no space left on device')) {
    return { type: 'INFRASTRUCTURE_FAILURE', reason: 'DISK_FULL', message: 'Hết dung lượng ổ cứng trên máy runner.' };
  }

  if (log.includes('eacces') || log.includes('permission denied') || exitCode === 126) {
    return { type: 'INFRASTRUCTURE_FAILURE', reason: 'PERMISSION_DENIED', message: 'Lỗi phân quyền hệ thống trên máy runner.' };
  }

  if (log.includes('command not found') || log.includes('no such file or directory') || exitCode === 127) {
    return { type: 'INFRASTRUCTURE_FAILURE', reason: 'MISSING_TOOL', message: 'Thiếu công cụ hoặc đường dẫn thực thi.' };
  }

  if (log.includes('timeout') || log.includes('killed')) {
    return { type: 'INFRASTRUCTURE_FAILURE', reason: 'TIMEOUT', message: 'Tiến trình vượt quá thời gian thực thi tối đa.' };
  }

  // Mặc định: Lỗi từ phía bộ test của sản phẩm (Product Test Failure)
  return {
    type: 'PRODUCT_TEST_FAILURE',
    reason: 'ASSERTION_FAILED',
    message: 'Bài kiểm thử sản phẩm thất bại (Unit / Integration test assertion failed).'
  };
}

function enforceLogRetention(logDir, maxKeep = 20) {
  if (!fs.existsSync(logDir)) return 0;

  try {
    const files = fs.readdirSync(logDir)
      .map(name => ({
        name,
        path: path.join(logDir, name),
        mtime: fs.statSync(path.join(logDir, name)).mtimeMs
      }))
      .filter(f => f.name.endsWith('.log'))
      .sort((a, b) => b.mtime - a.mtime); // mới nhất lên đầu

    if (files.length > maxKeep) {
      const toDelete = files.slice(maxKeep);
      toDelete.forEach(f => fs.unlinkSync(f.path));
      return toDelete.length;
    }
  } catch (_) {}

  return 0;
}

module.exports = {
  createEvidenceRecord,
  classifyFailure,
  enforceLogRetention
};
