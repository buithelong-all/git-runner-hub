const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('gitRunnerAPI', {
  getSystemInfo: () => ipcRenderer.invoke('app:get-system-info'),
  fetchRepos: () => ipcRenderer.invoke('app:fetch-repos'),
  getLocalRunners: () => ipcRenderer.invoke('app:get-local-runners'),
  checkRunnerStatus: (repo) => ipcRenderer.invoke('app:check-runner-status', repo),
  setupRunner: (repo) => ipcRenderer.invoke('app:setup-runner', repo),
  lifecycleRunner: (action, repoFullName) => ipcRenderer.invoke('app:lifecycle-runner', { action, repoFullName }),
  openExternal: (url) => ipcRenderer.invoke('app:open-external', url),
  onLogUpdate: (callback) => ipcRenderer.on('runner:log', (_, data) => callback(data)),

  // GRH-201..204: Auth & Account Management APIs
  getCurrentUser: () => ipcRenderer.invoke('auth:get-current-user'),
  loginWithToken: (token) => ipcRenderer.invoke('auth:login-token', token),
  loginWithGhCli: () => ipcRenderer.invoke('auth:login-import-gh'),
  startDeviceFlow: () => ipcRenderer.invoke('auth:device-flow-start'),
  pollDeviceFlow: (deviceCode) => ipcRenderer.invoke('auth:device-flow-poll', deviceCode),
  logout: () => ipcRenderer.invoke('auth:logout')
});
