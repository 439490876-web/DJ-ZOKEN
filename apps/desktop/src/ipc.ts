export type ExportTarget = 'serato' | 'rekordbox'
export type ExportPayload = { target: ExportTarget; setName: string; filePaths: string[] }
export type ExportResult = { ok: boolean; message?: string }

export const createExportHandler = (
  exporter: (payload: ExportPayload) => Promise<ExportResult> | ExportResult
) => {
  return async (payload: unknown): Promise<ExportResult> => {
    if (!isExportPayload(payload)) {
      return { ok: false, message: 'Invalid export payload' }
    }
    try {
      const result = await exporter(payload)
      return result
    } catch (err: any) {
      return { ok: false, message: err?.message || 'Export failed' }
    }
  }
}

export const isExportPayload = (value: any): value is ExportPayload => {
  return Boolean(value)
    && (value.target === 'serato' || value.target === 'rekordbox')
    && typeof value.setName === 'string'
    && Array.isArray(value.filePaths)
    && value.filePaths.every((p: any) => typeof p === 'string')
}
