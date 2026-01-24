import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('electronAPI', {
  exportSet: async () => ({ ok: false, message: 'not implemented' })
})
