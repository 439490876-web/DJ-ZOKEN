export const getFilePath = (file: File & { path?: string }) => {
  if (typeof file.path === 'string' && file.path.trim().length > 0) {
    return file.path
  }
  if (typeof window !== 'undefined') {
    const api = (window as any)?.electronAPI
    if (api && typeof api.getPathForFileKey === 'function') {
      try {
        const key = `${file.name}:${file.size}:${file.lastModified}`
        const resolved = api.getPathForFileKey(key)
        if (typeof resolved === 'string' && resolved.trim().length > 0) {
          return resolved
        }
      } catch {
        // ignore, fallback to null
      }
    }
    if (api && typeof api.getPathForFile === 'function') {
      try {
        const resolved = api.getPathForFile(file)
        if (typeof resolved === 'string' && resolved.trim().length > 0) {
          return resolved
        }
      } catch {
        // ignore, fallback to null
      }
    }
  }
  return null
}

export const attachFilePath = <T extends { filePath?: string | null }>(
  track: T,
  file: File & { path?: string }
): T => {
  const filePath = getFilePath(file)
  if (!filePath) {
    return track
  }
  return { ...track, filePath }
}
