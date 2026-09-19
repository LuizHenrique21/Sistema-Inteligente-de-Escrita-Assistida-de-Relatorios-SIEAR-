import { app, BrowserWindow } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'
import { registerAiIpc } from './ipc/ai.ipc'
import { registerAppIpc } from './ipc/app.ipc'
import { registerTemplatesIpc } from './ipc/templates.ipc'
import { getLogger } from './infrastructure/logging/logger.runtime'
import { serializeError } from './infrastructure/logging/log-sanitizer'

const electronDirectory = path.dirname(fileURLToPath(import.meta.url))
const logger = getLogger('Main')

process.on('uncaughtExceptionMonitor', (error, origin) => {
  logger.error('Unhandled exception observed', {
    origin,
    error: serializeError(error),
  })
})
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled rejection observed', {
    error: serializeError(reason),
  })
})

function createWindow(): void {
  const window = new BrowserWindow({
    width: 1100,
    height: 720,
    minWidth: 720,
    minHeight: 520,
    show: false,
    webPreferences: {
      preload: path.join(electronDirectory, 'preload.mjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  window.once('ready-to-show', () => window.show())

  if (process.env.VITE_DEV_SERVER_URL) {
    void window.loadURL(process.env.VITE_DEV_SERVER_URL)
  } else {
    void window.loadFile(path.join(electronDirectory, '../dist/index.html'))
  }
}

app.whenReady().then(() => {
  logger.info('Application starting', {
    version: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development',
    platform: process.platform,
    architecture: process.arch,
    electronVersion: process.versions.electron,
    nodeVersion: process.versions.node,
  })
  registerAppIpc()
  const templates = registerTemplatesIpc()
  registerAiIpc(templates.service)
  createWindow()
  logger.info('Application ready')
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

app.on('before-quit', () => logger.info('Application shutdown started'))
