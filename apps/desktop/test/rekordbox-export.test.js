const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { exportToRekordbox } = require('../src/export/rekordbox')

test('exportToRekordbox writes xml and returns path', async () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekordbox-xml-'))
  const result = await exportToRekordbox({
    setName: 'My Set',
    filePaths: ['/tmp/a.mp3', '/tmp/b.mp3'],
    trackMeta: [
      { name: 'Song A', artist: 'Artist A' },
      { name: 'Song B', artist: 'Artist B' },
    ],
    outputDir: tmpDir,
    openApp: false,
  })

  assert.equal(result.ok, true)
  assert.ok(result.xmlPath)
  assert.ok(result.xmlPath.endsWith('ZOKEN SETGPT.xml'))
  assert.ok(fs.existsSync(result.xmlPath))

  const xml = fs.readFileSync(result.xmlPath, 'utf8')
  assert.ok(xml.includes('<COLLECTION'))
  assert.ok(xml.includes('TrackID="1"'))
  assert.ok(xml.includes('<NODE Type="1" Name="My Set"'))
})
