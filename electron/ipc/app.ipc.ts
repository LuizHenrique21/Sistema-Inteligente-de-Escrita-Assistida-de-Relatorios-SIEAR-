import { app, ipcMain } from 'electron'
import type { AppInfo } from '../../src/types/siear-api'
import { getLogger } from '../infrastructure/logging/logger.runtime'
import { withIpcLogging } from '../infrastructure/logging/ipc-logging'

export function registerAppIpc(): void {
  ipcMain.handle(
    'app:get-info',
    withIpcLogging('app:get-info', getLogger('AppIpc'), (): AppInfo => ({
      name: 'SIEAR',
      version: app.getVersion(),
      environment: app.isPackaged ? 'production' : 'development',
    })),
  )
}
