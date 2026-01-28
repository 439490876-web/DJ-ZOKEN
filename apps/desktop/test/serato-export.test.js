const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { exportToSerato } = require('../src/export/serato')

const encodeUtf16BE = (value) => {
  const le = Buffer.from(value, 'utf16le')
  for (let i = 0; i < le.length; i += 2) {
    const tmp = le[i]
    le[i] = le[i + 1]
    le[i + 1] = tmp
  }
  return le
}

test('exportToSerato writes crate and updates database backup', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serato-test-'))
  const seratoDir = path.join(tmpDir, '_Serato_')
  const cratesDir = path.join(seratoDir, 'Subcrates')
  fs.mkdirSync(cratesDir, { recursive: true })

  const dbPath = path.join(seratoDir, 'database')
  fs.writeFileSync(dbPath, 'SERATO_DB\n')

  await exportToSerato({
    seratoDir,
    setName: 'My Set',
    filePaths: ['/tmp/a.mp3', '/tmp/b.mp3'],
  })

  const cratePath = path.join(cratesDir, 'My Set.crate')
  assert.equal(fs.existsSync(cratePath), true)

  const crateContents = fs.readFileSync(cratePath)
  const header = encodeUtf16BE('1.0/Serato ScratchLive Crate')
  assert.ok(crateContents.includes(Buffer.from('vrsn')))
  assert.ok(crateContents.includes(header))
  assert.ok(crateContents.includes(encodeUtf16BE('/tmp/a.mp3')))
  assert.ok(crateContents.includes(encodeUtf16BE('/tmp/b.mp3')))

  const backupPath = path.join(seratoDir, 'backup', 'database.bak')
  assert.equal(fs.existsSync(backupPath), true)
  assert.equal(fs.readFileSync(backupPath, 'utf8'), 'SERATO_DB\n')

  const dbContents = fs.readFileSync(dbPath, 'utf8')
  assert.ok(dbContents.includes('CRATE: My Set'))
})
