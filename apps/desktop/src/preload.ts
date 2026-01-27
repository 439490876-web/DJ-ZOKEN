import { createRequire } from 'node:module'

const require = createRequire(import.meta.url)
const { contextBridge, ipcRenderer, webUtils } = require('electron')


const filePathMap = new Map<string, string>()
const buildFileKey = (file: File) => `${file.name}:${file.size}:${file.lastModified}`
const buildFileSizeKey = (file: File) => `${file.name}:${file.size}`
const recordPath = (file: File, resolved?: string | null) => {
  if (typeof resolved !== 'string' || resolved.trim().length === 0) return
  filePathMap.set(buildFileKey(file), resolved)
  filePathMap.set(buildFileSizeKey(file), resolved)
  filePathMap.set(file.name, resolved)
}
const recordFiles = (files?: FileList | null) => {
  if (!files) { logPath('recordFiles: none'); return }
  logPath('recordFiles', files.length)
  Array.from(files).forEach((file) => {
    try {
      const resolved = webUtils.getPathForFile(file)
      logPath('file', file.name, file.size, file.lastModified, resolved ? 'ok' : 'empty')
      recordPath(file, resolved)
    } catch (err) {
      logPath('file_error', file.name, String(err))
    }
  })
}

const resolvePathForKey = (key?: string | null) => {
  if (!key || typeof key !== 'string') return null
  if (filePathMap.has(key)) return filePathMap.get(key) || null
  const last = key.lastIndexOf(':')
  if (last > 0) {
    const sizeKey = key.slice(0, last)
    if (filePathMap.has(sizeKey)) return filePathMap.get(sizeKey) || null
    const last2 = sizeKey.lastIndexOf(':')
    if (last2 > 0) {
      const nameKey = sizeKey.slice(0, last2)
      if (filePathMap.has(nameKey)) return filePathMap.get(nameKey) || null
    }
  }
  if (filePathMap.has(key)) return filePathMap.get(key) || null
  return null
}

if (typeof window !== 'undefined') {
  document.addEventListener('drop', (event: DragEvent) => {
    recordFiles(event.dataTransfer?.files || null)
  }, true)
  window.addEventListener('drop', (event: DragEvent) => {
    recordFiles(event.dataTransfer?.files || null)
  }, true)
  document.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement | null
    if (target && target.files) {
      recordFiles(target.files)
    }
  }, true)
}

const api = {
  exportSet: (payload: unknown) => ipcRenderer.invoke('export:set', payload),
  getPathForFile: (file: unknown) => webUtils.getPathForFile(file as File),
  getPathForFileKey: (key: string) => {
    const resolved = resolvePathForKey(key)
    logPath('lookup', key, resolved ? 'hit' : 'miss')
    return resolved
  }
}

if (process.contextIsolated) {
  contextBridge.exposeInMainWorld('electronAPI', api)
} else {
  // @ts-ignore
  window.electronAPI = api
}

