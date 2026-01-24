const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  exportSet: (payload) => ipcRenderer.invoke('export:set', payload),
})
