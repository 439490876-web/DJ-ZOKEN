import { contextBridge, ipcRenderer } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  exportSet: (payload: unknown) => ipcRenderer.invoke('export:set', payload),
})
