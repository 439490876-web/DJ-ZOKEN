const fs = require('node:fs/promises')
const fssync = require('node:fs')
const path = require('node:path')

const safeFilename = (name) => {
  const trimmed = name.trim() || 'Untitled'
  return trimmed.replace(/[\/:*?"<>|]+/g, '_')
}

const hasNullByte = (buffer) => buffer.includes(0)

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
  const crateLines = ['Serato ScratchLive Crate', `NAME:${crateName}`]
  for (const filePath of filePaths) {
    crateLines.push(`PATH:${filePath}`)
  }
  await withTimeout(fs.writeFile(cratePath, crateLines.join('\n')), 5000, 'write:crate')

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
