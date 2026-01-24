import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('electronAPI', {
  exportSet: (payload: unknown) => ipcRenderer.invoke('export:set', payload),
})
