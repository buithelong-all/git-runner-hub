const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('node:child_process');
const path = require('node:path');
const helper = path.join(__dirname, '..', 'scripts', 'runner-sandbox-linux.sh');
test('sandbox renders a repository-scoped service boundary without host mutation', () => {
  const result = spawnSync('bash', [helper, '--render', 'buithelong-all/git-runner-hub'], {encoding:'utf8'});
  assert.equal(result.status, 0, result.stderr);
  const settings = Object.fromEntries(result.stdout.trim().split('\n').filter(x => x.includes('=')).map(x => { const i=x.indexOf('='); return [x.slice(0,i),x.slice(i+1)]; }));
  assert.equal(settings.NoNewPrivileges, 'yes');
  assert.equal(settings.ProtectSystem, 'strict');
  assert.equal(settings.ProtectHome, 'yes');
  assert.equal(settings.RestrictNamespaces, 'yes');
  assert.equal(settings.CapabilityBoundingSet, '');
  assert.equal(settings.KillMode, 'control-group');
  assert.equal(settings.ReadWritePaths, '/opt/actions-runner-buithelong-all-git-runner-hub-3605dc3bbe4d /var/lib/gitrunnerhub/home-buithelong-all-git-runner-hub-3605dc3bbe4d /var/lib/gitrunnerhub/work-buithelong-all-git-runner-hub-3605dc3bbe4d');
  assert.equal(settings.TemporaryFileSystem, '/opt:ro /var/lib/gitrunnerhub:ro /mnt:ro');
  assert.equal(settings.BindReadOnlyPaths, '/mnt/wsl/resolv.conf');
  assert.equal(settings.BindPaths, settings.ReadWritePaths);
  for (const blocked of ['/media','/init','/run/WSL','/usr/lib/wsl']) {
    assert.ok(settings.InaccessiblePaths.split(' ').includes('-'+blocked), blocked);
  }
  assert.match(settings.ExecStartPre, /sandbox-check\.sh/);
});
test('sandbox helper rejects malformed repo names and unknown actions', () => {
  for (const args of [['--render','../bad'], ['--render','owner/repo;id'], ['delete','owner/repo']]) {
    const r=spawnSync('bash',[helper,...args],{encoding:'utf8'});
    assert.equal(r.status,2,r.stderr);
  }
});
