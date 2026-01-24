const test = require('node:test')
const assert = require('node:assert/strict')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')
const { createRequire } = require('node:module')
const { exportToRekordbox } = require('../src/export/rekordbox')

const requireNative = createRequire(__filename)
const Database = requireNative('better-sqlite3')

const createSchema = (db) => {
  db.exec(`
    CREATE TABLE tracks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      path TEXT NOT NULL
    );
    CREATE TABLE playlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL
    );
    CREATE TABLE playlist_tracks (
      playlist_id INTEGER NOT NULL,
      track_id INTEGER NOT NULL
    );
  `)
}

test('exportToRekordbox writes tracks and playlist', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rekordbox-test-'))
  const dbPath = path.join(tmpDir, 'master.db')
  const db = new Database(dbPath)
  createSchema(db)
  db.close()

  exportToRekordbox({
    dbPath,
    setName: 'My Set',
    filePaths: ['/tmp/a.mp3', '/tmp/b.mp3'],
  })

  const verifyDb = new Database(dbPath)
  const trackCount = verifyDb.prepare('SELECT COUNT(*) as count FROM tracks').get()
  const playlistCount = verifyDb.prepare('SELECT COUNT(*) as count FROM playlists').get()
  const linkCount = verifyDb.prepare('SELECT COUNT(*) as count FROM playlist_tracks').get()
  const playlist = verifyDb.prepare('SELECT name FROM playlists').get()
  const tracks = verifyDb.prepare('SELECT path FROM tracks ORDER BY id').all()
  verifyDb.close()

  assert.equal(trackCount.count, 2)
  assert.equal(playlistCount.count, 1)
  assert.equal(linkCount.count, 2)
  assert.equal(playlist.name, 'My Set')
  assert.deepEqual(
    tracks.map((row) => row.path),
    ['/tmp/a.mp3', '/tmp/b.mp3']
  )
})
