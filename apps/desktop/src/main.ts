import { app, BrowserWindow, ipcMain } from 'electron'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { createExportHandler } from './ipc.js'
import { exportToRekordbox } from './export/rekordbox.js'
import { exportToSerato } from './export/serato.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const createWindow = () => {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  const devUrl = process.env.VITE_DEV_SERVER_URL
  if (devUrl) {
    void win.loadURL(devUrl)
    return
  }

  void win.loadFile(path.join(__dirname, '../renderer/index.html'))
}

ipcMain.handle(
  'export:set',
  createExportHandler(async (payload) => {
    if (payload.target === 'rekordbox') {
      const dbPath = process.env.REKORDBOX_DB_PATH
      if (!dbPath) {
        return { ok: false, message: 'Missing REKORDBOX_DB_PATH' }
      }
      exportToRekordbox({
        dbPath,
        setName: payload.setName,
        filePaths: payload.filePaths,
      })
      return { ok: true, message: 'rekordbox export ok' }
    }

    const seratoDir = process.env.SERATO_DIR
    if (!seratoDir) {
      return { ok: false, message: 'Missing SERATO_DIR' }
    }
    exportToSerato({
      seratoDir,
      setName: payload.setName,
      filePaths: payload.filePaths,
    })
    return { ok: true, message: 'serato export ok' }
  })
)

app.whenReady().then(() => {
  createWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})
