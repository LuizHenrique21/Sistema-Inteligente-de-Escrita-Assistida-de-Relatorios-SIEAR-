import { app, ipcMain } from 'electron'
import type { AppInfo } from '../../src/types/siear-api'

export function registerAppIpc(): void {
  ipcMain.handle('app:get-info', (): AppInfo => ({
    name: 'SIEAR',
    version: app.getVersion(),
    environment: app.isPackaged ? 'production' : 'development',
  }))
}
