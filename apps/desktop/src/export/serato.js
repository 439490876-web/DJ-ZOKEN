const fs = require('node:fs/promises')
const fssync = require('node:fs')
const path = require('node:path')

const safeFilename = (name) => {
  const trimmed = name.trim() || 'Untitled'
  return trimmed.replace(/[\/:*?"<>|]+/g, '_')
}

const hasNullByte = (buffer) => buffer.includes(0)

const encodeUtf16BE = (value) => {
  const le = Buffer.from(value, 'utf16le')
  for (let i = 0; i < le.length; i += 2) {
    const tmp = le[i]
    le[i] = le[i + 1]
    le[i + 1] = tmp
  }
  return le
}

const buildSeratoTrackChunk = (filePath) => {
  const pathBytes = encodeUtf16BE(filePath)
  const ptrkLen = Buffer.alloc(4)
  ptrkLen.writeUInt32BE(pathBytes.length)
  const ptrk = Buffer.concat([Buffer.from('ptrk'), ptrkLen, pathBytes])
  const otrkLen = Buffer.alloc(4)
  otrkLen.writeUInt32BE(ptrk.length)
  return Buffer.concat([Buffer.from('otrk'), otrkLen, ptrk])
}

const loadCrateHeader = async (cratesDir) => {
  try {
    const entries = await fs.readdir(cratesDir)
    for (const entry of entries) {
      if (!entry.endsWith('.crate')) continue
      const candidate = path.join(cratesDir, entry)
      const raw = await fs.readFile(candidate)
      const idx = raw.indexOf(Buffer.from('otrk'))
      if (idx > 0) {
        return raw.slice(0, idx)
      }
    }
  } catch (err) {
    console.log('[export-serato] header-skip', { error: String(err) })
  }

  const headerText = '1.0/Serato ScratchLive Crate'
  const headerPayload = encodeUtf16BE(headerText)
  const vrsnLen = Buffer.alloc(4)
  vrsnLen.writeUInt32BE(headerPayload.length)
  return Buffer.concat([Buffer.from('vrsn'), vrsnLen, headerPayload])
}

const withTimeout = async (promise, ms, label) => {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(`timeout:${label}`)), ms)
  })
  try {
    return await Promise.race([promise, timeout])
  } finally {
    clearTimeout(timer)
  }
}

const backupFile = async (source, backupDir) => {
  if (!fssync.existsSync(source)) return
  await fs.mkdir(backupDir, { recursive: true })
  const filename = path.basename(source)
  await fs.copyFile(source, path.join(backupDir, `${filename}.bak`))
}

const exportToSerato = async ({ seratoDir, setName, filePaths }) => {
  console.log('[export-serato] start', { setName, count: Array.isArray(filePaths) ? filePaths.length : null })
  const cratesDir = path.join(seratoDir, 'Subcrates')
  await withTimeout(fs.mkdir(cratesDir, { recursive: true }), 5000, 'mkdir:Subcrates')

  const crateName = safeFilename(setName)
  const cratePath = path.join(cratesDir, `${crateName}.crate`)
  const header = await loadCrateHeader(cratesDir)
  const trackChunks = []
  for (const filePath of filePaths) {
    if (!filePath) continue
    trackChunks.push(buildSeratoTrackChunk(filePath))
  }
  const crateBody = Buffer.concat([header, ...trackChunks])
  await withTimeout(fs.writeFile(cratePath, crateBody), 5000, 'write:crate')

  const backupDir = path.join(seratoDir, 'backup')
  const dbCandidates = ['database', 'database V2']
  for (const dbName of dbCandidates) {
    const dbPath = path.join(seratoDir, dbName)
    if (!fssync.existsSync(dbPath)) continue
    try {
      await withTimeout(backupFile(dbPath, backupDir), 5000, `backup:${dbName}`)
      const raw = await withTimeout(fs.readFile(dbPath), 8000, `read:${dbName}`)
      if (hasNullByte(raw)) continue
      const text = raw.toString('utf8')
      const updated = `${text}CRATE: ${crateName}\n`
      await withTimeout(fs.writeFile(dbPath, updated), 8000, `write:${dbName}`)
    } catch (err) {
      console.log('[export-serato] db-skip', { dbName, error: String(err) })
      continue
    }
  }
  console.log('[export-serato] done', { cratePath })
  return { cratePath }
}

module.exports = {
  exportToSerato,
}
