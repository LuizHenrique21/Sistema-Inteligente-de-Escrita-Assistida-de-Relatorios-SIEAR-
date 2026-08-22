import { ipcMain } from 'electron'
import { reportTemplateService } from '../services/templates/report-template.container'
import { createTemplatesHandlers } from './templates.handler'

const handlers = createTemplatesHandlers(reportTemplateService)

export function registerTemplatesIpc(): void {
  ipcMain.handle('templates:get-all', () => handlers.getAll())
  ipcMain.handle('templates:get-by-id', (_event, id: unknown) =>
    handlers.getById(id),
  )
  ipcMain.handle('templates:create', (_event, template: unknown) =>
    handlers.create(template),
  )
  ipcMain.handle('templates:update', (_event, id: unknown, template: unknown) =>
    handlers.update(id, template),
  )
  ipcMain.handle('templates:delete', (_event, id: unknown) =>
    handlers.delete(id),
  )
}
