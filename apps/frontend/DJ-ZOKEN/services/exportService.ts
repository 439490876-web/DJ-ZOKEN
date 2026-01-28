export type ExportTarget = 'serato' | 'rekordbox'
export type ExportTrackMeta = {
  name: string
  artist: string
  album?: string | null
  bpm?: number | null
  key?: string | null
}
export type ExportPayload = {
  target: ExportTarget
  setName: string
  filePaths: string[]
  trackMeta?: ExportTrackMeta[]
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
  filePaths: Array<string | null | undefined>,
  tracks: Array<{
    title?: string | null
    artist?: string | null
    album?: string | null
    bpm?: number | null
    key?: string | null
  }> = []
): ExportPayload => {
  const filtered: string[] = []
  const trackMeta: ExportTrackMeta[] = []

  filePaths.forEach((path, index) => {
    if (typeof path !== 'string' || path.trim().length === 0) return
    filtered.push(path)
    const track = tracks[index] || {}
    trackMeta.push({
      name: String(track.title || '').trim() || 'Unknown Title',
      artist: String(track.artist || '').trim() || 'Unknown Artist',
      album: track.album ?? null,
      bpm: typeof track.bpm === 'number' ? track.bpm : null,
      key: track.key ?? null,
    })
  })

  return {
    target,
    setName,
    filePaths: filtered,
    trackMeta: trackMeta.length > 0 ? trackMeta : undefined,
  }
}
