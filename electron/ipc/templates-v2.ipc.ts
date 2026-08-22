import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import { SemanticAnalysisService } from '../services/ai/semantic-analysis.service'
import { WritingAnalysisService } from '../services/ai/writing-analysis.service'
import { DocumentExtractorService } from '../services/documents/document-extractor.service'
import { FormattingAnalysisService } from '../services/documents/formatting-analysis.service'
import { StructureAnalysisService } from '../services/documents/structure-analysis.service'
import { OllamaService } from '../services/ollama/ollama.service'
import { ReportTemplateBuilder } from '../services/templates/report-template.builder'
import { createReportTemplateV2CreationContainer } from '../services/templates/report-template-v2.container'
import { TemplateCreationPipeline } from '../services/templates/template-creation.pipeline'
import { createTemplatesV2Handlers } from './templates-v2.handler'

const ollama = new OllamaService()
const pipeline = new TemplateCreationPipeline(
  new DocumentExtractorService(),
  new StructureAnalysisService(ollama),
  new WritingAnalysisService(ollama),
  new SemanticAnalysisService(ollama),
  new FormattingAnalysisService(),
  new ReportTemplateBuilder(),
)
const container = createReportTemplateV2CreationContainer(pipeline)
const handlers = createTemplatesV2Handlers(
  container.creationService,
  container.service,
)

function sendProgress(event: IpcMainInvokeEvent) {
  return (progress: { step: number; message: string }): void => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('templates-v2:creation-progress', progress)
    }
  }
}

export function registerTemplatesV2Ipc(): void {
  ipcMain.handle('templates-v2:create-from-document', (event, request) =>
    handlers.createFromDocument(request, sendProgress(event)),
  )
  ipcMain.handle('templates-v2:get-all', () => handlers.getAll())
  ipcMain.handle('templates-v2:get-by-id', (_event, id: unknown) =>
    handlers.getById(id),
  )
  ipcMain.handle('templates-v2:update', (_event, template: unknown) =>
    handlers.update(template),
  )
  ipcMain.handle('templates-v2:confirm', (_event, id: unknown) =>
    handlers.confirm(id),
  )
  ipcMain.handle('templates-v2:delete', (_event, id: unknown) =>
    handlers.delete(id),
  )
}
