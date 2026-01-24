export type ExportTarget = 'serato' | 'rekordbox'
export type ExportPayload = { target: ExportTarget; setName: string; filePaths: string[] }

export const isExportPayload = (value: any): value is ExportPayload => {
  return Boolean(value)
    && (value.target === 'serato' || value.target === 'rekordbox')
    && typeof value.setName === 'string'
    && Array.isArray(value.filePaths)
    && value.filePaths.every((p: any) => typeof p === 'string')
}
