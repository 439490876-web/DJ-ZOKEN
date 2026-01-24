export const isExportPayload = (value) => {
  return Boolean(value)
    && (value.target === 'serato' || value.target === 'rekordbox')
    && typeof value.setName === 'string'
    && Array.isArray(value.filePaths)
    && value.filePaths.every((p) => typeof p === 'string')
}
