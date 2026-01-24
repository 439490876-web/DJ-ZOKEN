const { createRequire } = require('node:module')

const requireNative = createRequire(__filename)
const Database = requireNative('better-sqlite3')

const hasTable = (db, name) => {
  const row = db
    .prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?")
    .get(name)
  return Boolean(row && row.name)
}

const exportToRekordbox = ({ dbPath, setName, filePaths }) => {
  const db = new Database(dbPath)
  const requiredTables = ['tracks', 'playlists', 'playlist_tracks']
  const missing = requiredTables.filter((table) => !hasTable(db, table))
  if (missing.length > 0) {
    db.close()
    throw new Error(`Rekordbox schema missing tables: ${missing.join(', ')}`)
  }

  const insertPlaylist = db.prepare('INSERT INTO playlists (name) VALUES (?)')
  const insertTrack = db.prepare('INSERT INTO tracks (path) VALUES (?)')
  const insertLink = db.prepare(
    'INSERT INTO playlist_tracks (playlist_id, track_id) VALUES (?, ?)'
  )

  const transaction = db.transaction(() => {
    const playlistInfo = insertPlaylist.run(setName)
    const playlistId = playlistInfo.lastInsertRowid

    for (const path of filePaths) {
      const trackInfo = insertTrack.run(path)
      insertLink.run(playlistId, trackInfo.lastInsertRowid)
    }
  })

  transaction()
  db.close()
}

module.exports = {
  exportToRekordbox,
}
