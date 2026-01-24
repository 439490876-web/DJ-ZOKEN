import fs from 'node:fs'
import path from 'node:path'

export type SeratoExportPayload = {
  seratoDir: string
  setName: string
  filePaths: string[]
}

const safeFilename = (name: string) => {
  const trimmed = name.trim() || 'Untitled'
  return trimmed.replace(/[\\/:*?"<>|]+/g, '_')
}

const hasNullByte = (buffer: Buffer) => buffer.includes(0)

const backupFile = (source: string, backupDir: string) => {
  if (!fs.existsSync(source)) return
  fs.mkdirSync(backupDir, { recursive: true })
  const filename = path.basename(source)
  fs.copyFileSync(source, path.join(backupDir, `${filename}.bak`))
}

export const exportToSerato = ({
  seratoDir,
  setName,
  filePaths,
}: SeratoExportPayload) => {
  const cratesDir = path.join(seratoDir, 'Subcrates')
  fs.mkdirSync(cratesDir, { recursive: true })

  const crateName = safeFilename(setName)
  const cratePath = path.join(cratesDir, `${crateName}.crate`)
  const crateLines = ['Serato ScratchLive Crate', `NAME:${crateName}`]
  for (const filePath of filePaths) {
    crateLines.push(`PATH:${filePath}`)
  }
  fs.writeFileSync(cratePath, crateLines.join('\n'))

  const backupDir = path.join(seratoDir, 'backup')
  const dbCandidates = ['database', 'database V2']
  for (const dbName of dbCandidates) {
    const dbPath = path.join(seratoDir, dbName)
    if (!fs.existsSync(dbPath)) continue
    backupFile(dbPath, backupDir)
    const raw = fs.readFileSync(dbPath)
    if (hasNullByte(raw)) continue
    const text = raw.toString('utf8')
    const updated = `${text}CRATE: ${crateName}\n`
    fs.writeFileSync(dbPath, updated)
  }
}
