import { app, dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import path from 'node:path'
import type { TemplatesResult } from '../../src/types/templates'
import type { ReportTemplate } from '../../src/domain/templates/report-template'
import { SemanticAnalysisService } from '../services/ai/semantic-analysis.service'
import { WritingAnalysisService } from '../services/ai/writing-analysis.service'
import { DocumentExtractorService } from '../services/documents/document-extractor.service'
import { FormattingAnalysisService } from '../services/documents/formatting-analysis.service'
import { StructureAnalysisService } from '../services/documents/structure-analysis.service'
import { OllamaService } from '../services/ollama/ollama.service'
import { ReportTemplateBuilder } from '../services/templates/report-template.builder'
import { createProductionReportTemplateCreationContainer } from '../services/templates/report-template.container'
import type { ProductionReportTemplateCreationContainer } from '../services/templates/report-template.container'
import { TemplateCreationPipeline } from '../services/templates/template-creation.pipeline'
import { createTemplatesHandlers } from './templates.handler'
import { getLogger } from '../infrastructure/logging/logger.runtime'
import { serializeError } from '../infrastructure/logging/log-sanitizer'
import { withIpcLogging } from '../infrastructure/logging/ipc-logging'
import { SqlitePipelineCheckpointRepository } from '../repositories/checkpoints/sqlite-pipeline-checkpoint.repository'
import { PipelineCheckpointCoordinator } from '../services/templates/pipeline-checkpoint.coordinator'
import { createPipelineCheckpointCompatibility } from '../services/templates/pipeline-checkpoint.config'

function sendProgress(event: IpcMainInvokeEvent) {
  return (progress: { step: number; message: string }): void => {
    if (!event.sender.isDestroyed()) {
      event.sender.send('templates:creation-progress', progress)
    }
  }
}

export function registerTemplatesIpc(): ProductionReportTemplateCreationContainer {
  const ipcLogger = getLogger('TemplatesIpc')
  const databasePath = path.join(app.getPath('userData'), 'siear.sqlite3')
  const ollama = new OllamaService()
  const checkpointRepository = new SqlitePipelineCheckpointRepository(
    databasePath,
  )
  const checkpointCoordinator = new PipelineCheckpointCoordinator(
    checkpointRepository,
    createPipelineCheckpointCompatibility(ollama.modelName),
  )
  const pipeline = new TemplateCreationPipeline(
    new DocumentExtractorService(),
    new StructureAnalysisService(ollama),
    new WritingAnalysisService(ollama),
    new SemanticAnalysisService(ollama),
    new FormattingAnalysisService(),
    new ReportTemplateBuilder(),
    { coordinator: checkpointCoordinator },
  )
  const container = createProductionReportTemplateCreationContainer(
    pipeline,
    databasePath,
  )
  const handlers = createTemplatesHandlers(
    container.creationService,
    container.service,
  )
  app.once('before-quit', () => {
    checkpointRepository.close()
    container.repository.close()
  })

  ipcMain.handle(
    'templates:create-from-document',
    withIpcLogging(
      'templates:create-from-document',
      ipcLogger,
      async (event) => {
        let selection
        try {
          selection = await dialog.showOpenDialog({
            title: 'Criar modelo a partir de DOCX',
            properties: ['openFile'],
            filters: [{ name: 'Documento do Word', extensions: ['docx'] }],
          })
        } catch (error: unknown) {
          ipcLogger.error('Document picker failed', {
            error: serializeError(error),
          })
          return {
            success: false,
            error: {
              code: 'UNEXPECTED_ERROR',
              message: 'Não foi possível abrir o seletor de documentos.',
            },
          } satisfies TemplatesResult<ReportTemplate>
        }
        if (selection.canceled) {
          return {
            success: false,
            error: { code: 'CANCELED', message: 'Seleção cancelada.' },
          } satisfies TemplatesResult<ReportTemplate>
        }
        if (selection.filePaths.length !== 1) {
          return {
            success: false,
            error: {
              code: 'VALIDATION_ERROR',
              message: 'Selecione exatamente um arquivo DOCX.',
            },
          } satisfies TemplatesResult<ReportTemplate>
        }
        const filePath = selection.filePaths[0] ?? ''
        return handlers.createFromDocument({ filePath }, sendProgress(event))
      },
    ),
  )
  ipcMain.handle(
    'templates:get-all',
    withIpcLogging('templates:get-all', ipcLogger, () => handlers.getAll()),
  )
  ipcMain.handle(
    'templates:get-by-id',
    withIpcLogging('templates:get-by-id', ipcLogger, (_event, id: unknown) =>
      handlers.getById(id),
    ),
  )
  ipcMain.handle(
    'templates:update',
    withIpcLogging('templates:update', ipcLogger, (_event, template: unknown) =>
      handlers.update(template),
    ),
  )
  ipcMain.handle(
    'templates:confirm',
    withIpcLogging('templates:confirm', ipcLogger, (_event, id: unknown) =>
      handlers.confirm(id),
    ),
  )
  ipcMain.handle(
    'templates:delete',
    withIpcLogging('templates:delete', ipcLogger, (_event, id: unknown) =>
      handlers.delete(id),
    ),
  )
  return container
}
