import { ipcMain } from 'electron'
import { InMemoryReportTemplateRepository } from '../repositories/templates/in-memory-report-template.repository'
import { TECHNICAL_REPORT_TEMPLATE } from '../services/templates/default-report-templates'
import { ReportTemplateService } from '../services/templates/report-template.service'
import { createTemplatesHandlers } from './templates.handler'

const repository = new InMemoryReportTemplateRepository([
  TECHNICAL_REPORT_TEMPLATE,
])
const service = new ReportTemplateService(repository)
const handlers = createTemplatesHandlers(service)

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
