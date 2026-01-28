const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { execFileSync } = require('node:child_process')
const { buildRekordboxXml } = require('./rekordboxXml')
const { mergeRekordboxXml } = require('./rekordboxXmlMerge')

const sanitizeFileName = (value) => {
  return String(value || 'export')
    .replace(/[\\/:*?"<>|]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const buildTracks = ({ filePaths, trackMeta = [] }) => {
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

const exportToRekordbox = async ({
  setName,
  filePaths,
  trackMeta,
  outputDir,
  openApp = true,
}) => {
  const resolvedDir = outputDir || path.join(os.homedir(), 'Documents', 'DJ-ZOKEN', 'Exports', 'rekordbox')
  fs.mkdirSync(resolvedDir, { recursive: true })

  const safeName = sanitizeFileName(setName)
  const xmlPath = path.join(resolvedDir, `ZOKEN SETGPT.xml`)
  const tracks = buildTracks({ filePaths, trackMeta })
  let xml
  if (fs.existsSync(xmlPath)) {
    const baseXml = fs.readFileSync(xmlPath, 'utf8')
    xml = mergeRekordboxXml(baseXml, { setName: safeName, tracks }).xml
  } else {
    xml = buildRekordboxXml({ setName: safeName, tracks })
  }
  fs.writeFileSync(xmlPath, xml, 'utf8')

  if (openApp) {
    try {
      execFileSync('open', ['-a', 'rekordbox'])
      execFileSync('open', ['-R', xmlPath])
    } catch (err) {
      // ignore open errors, export still ok
    }
  }

  return { ok: true, xmlPath }
}

module.exports = {
  exportToRekordbox,
}
