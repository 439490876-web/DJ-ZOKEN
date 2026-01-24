import test from 'node:test'
import assert from 'node:assert/strict'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { exportToSerato } from '../src/export/serato.js'

test('exportToSerato writes crate and updates database backup', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'serato-test-'))
  const seratoDir = path.join(tmpDir, '_Serato_')
  const cratesDir = path.join(seratoDir, 'Subcrates')
  fs.mkdirSync(cratesDir, { recursive: true })

  const dbPath = path.join(seratoDir, 'database')
  fs.writeFileSync(dbPath, 'SERATO_DB\n')

  exportToSerato({
    seratoDir,
    setName: 'My Set',
    filePaths: ['/tmp/a.mp3', '/tmp/b.mp3'],
  })

  const cratePath = path.join(cratesDir, 'My Set.crate')
  assert.equal(fs.existsSync(cratePath), true)

  const crateContents = fs.readFileSync(cratePath, 'utf8')
  assert.ok(crateContents.includes('Serato ScratchLive Crate'))
  assert.ok(crateContents.includes('/tmp/a.mp3'))
  assert.ok(crateContents.includes('/tmp/b.mp3'))

  const backupPath = path.join(seratoDir, 'backup', 'database.bak')
  assert.equal(fs.existsSync(backupPath), true)
  assert.equal(fs.readFileSync(backupPath, 'utf8'), 'SERATO_DB\n')

  const dbContents = fs.readFileSync(dbPath, 'utf8')
  assert.ok(dbContents.includes('CRATE: My Set'))
})
