export type ExportTarget = 'serato' | 'rekordbox'
export type ExportPayload = {
  target: ExportTarget
  setName: string
  filePaths: string[]
}

export const getMissingFilePaths = (
  filePaths: Array<string | null | undefined>
): Array<string | null | undefined> => {
  return filePaths.filter((path) => {
    return typeof path !== 'string' || path.trim().length === 0
  })
}

export const buildExportPayload = (
  target: ExportTarget,
  setName: string,
  filePaths: Array<string | null | undefined>
): ExportPayload => {
  const filtered = filePaths.filter((path): path is string => {
    return typeof path === 'string' && path.trim().length > 0
  })

  return {
    target,
    setName,
    filePaths: filtered,
  }
}
