const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitRunnerAPI', {
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  fetchRepos: () => ipcRenderer.invoke('app:fetch-repos'),
  getLocalRunners: () => ipcRenderer.invoke('app:get-local-runners'),
  checkRunnerStatus: (repo) => ipcRenderer.invoke('app:check-runner-status', repo),
  setupRunner: (repo) => ipcRenderer.invoke('app:setup-runner', repo),
  lifecycleRunner: (action, repoFullName) => ipcRenderer.invoke('app:lifecycle-runner', { action, repoFullName }),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  onLogUpdate: (callback) => ipcRenderer.on('runner:log', (_, data) => callback(data))
});
