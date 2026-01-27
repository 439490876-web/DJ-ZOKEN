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
  return async (_event, payload) => {
    console.log('[export-ipc] begin ' + JSON.stringify(payload))
    if (!isExportPayload(payload)) {
      console.log('[export-ipc] invalid payload ' + JSON.stringify(payload))
      return { ok: false, message: 'Invalid export payload' }
    }
    try {
      const result = await exporter(payload)
      console.log('[export-ipc] done ' + JSON.stringify(result))
      return result
    } catch (err) {
      console.log('[export-ipc] error ' + String(err))
      return { ok: false, message: err?.message || 'Export failed' }
    }
  }
}

module.exports = {
  isExportPayload,
  createExportHandler,
}
