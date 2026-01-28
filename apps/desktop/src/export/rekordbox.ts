import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { buildRekordboxXml, RekordboxTrack } from './rekordboxXml'

export type RekordboxExportPayload = {
  setName: string
  filePaths: string[]
  trackMeta?: Array<{
    id?: string
    name?: string
    artist?: string
    album?: string | null
    bpm?: number | null
    key?: string | null
  }>
  outputDir?: string
  openApp?: boolean
}

const sanitizeFileName = (value: string) => {
  return String(value || 'export')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildTracks = (payload: RekordboxExportPayload): RekordboxTrack[] => {
  const { filePaths, trackMeta = [] } = payload
  return filePaths.map((filePath, idx) => {
    const meta = trackMeta[idx] || {}
    return {
      id: meta.id || `track-${idx + 1}`,
      name: meta.name || path.basename(filePath, path.extname(filePath)),
      artist: meta.artist || 'Unknown Artist',
      album: meta.album || null,
      bpm: typeof meta.bpm === 'number' ? meta.bpm : null,
      key: meta.key || null,
      location: filePath,
    }
  })
}

export const exportToRekordbox = async (payload: RekordboxExportPayload) => {
  const resolvedDir = payload.outputDir || path.join(os.homedir(), 'Documents', 'DJ-ZOKEN', 'Exports', 'rekordbox')
  fs.mkdirSync(resolvedDir, { recursive: true })

  const safeName = sanitizeFileName(payload.setName)
  const xmlPath = path.join(resolvedDir, `${safeName}.xml`)
  const tracks = buildTracks(payload)
  const xml = buildRekordboxXml({ setName: safeName, tracks })
  fs.writeFileSync(xmlPath, xml, 'utf8')

  if (payload.openApp !== false) {
    try {
      execFileSync('open', ['-a', 'rekordbox'])
      execFileSync('open', ['-R', xmlPath])
    } catch {
      // ignore open errors
    }
  }

  return { ok: true, xmlPath }
}
