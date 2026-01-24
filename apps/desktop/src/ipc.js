const isExportPayload = (value) => {
  return (
    Boolean(value) &&
    (value.target === 'serato' || value.target === 'rekordbox') &&
    typeof value.setName === 'string' &&
    Array.isArray(value.filePaths) &&
    value.filePaths.every((p) => typeof p === 'string')
  )
}

const createExportHandler = (exporter) => {
  return async (payload) => {
    if (!isExportPayload(payload)) {
      return { ok: false, message: 'Invalid export payload' }
    }
    try {
      return await exporter(payload)
    } catch (err) {
      return { ok: false, message: err?.message || 'Export failed' }
    }
  }
}

module.exports = {
  isExportPayload,
  createExportHandler,
}
