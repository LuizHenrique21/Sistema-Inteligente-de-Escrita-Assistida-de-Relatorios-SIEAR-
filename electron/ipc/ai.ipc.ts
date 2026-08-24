import { dialog, ipcMain } from 'electron'
import { writeFile } from 'node:fs/promises'
import { ReportExtractionService } from '../services/ai/report-extraction.service'
import { ReportGenerationService } from '../services/ai/report-generation.service'
import { UserInformationExtractor } from '../services/ai/user-information-extractor'
import { OllamaService } from '../services/ollama/ollama.service'
import type { ReportTemplateService } from '../services/templates/report-template.service'
import { ReportGenerationPipeline } from '../services/reports/report-generation.pipeline'
import { ReportGenerationPlanner } from '../services/reports/report-generation-planner'
import { DocumentRenderer } from '../services/documents/document-renderer'
import { createAiGenerateHandler } from './ai.handler'
import { createReportExtractionHandler } from './report-extraction.handler'
import { createReportGenerationHandler } from './report-generation.handler'
import { createReportExportHandler } from './report-export.handler'

const ollamaService = new OllamaService()
const generate = createAiGenerateHandler(ollamaService)
const reportExtractionService = new ReportExtractionService(ollamaService)
const extractReportInformation = createReportExtractionHandler(
  reportExtractionService,
)
const reportGenerationPipeline = new ReportGenerationPipeline(
  new UserInformationExtractor(ollamaService),
  new ReportGenerationPlanner(),
  new ReportGenerationService(ollamaService),
)
export function registerAiIpc(templates: ReportTemplateService): void {
  const generateReport = createReportGenerationHandler(
    reportGenerationPipeline,
    templates,
  )
  const exportReport = createReportExportHandler(
    templates,
    new DocumentRenderer(),
    {
      select: async (report) => {
        const safeName = report.templateName
          .split('')
          .filter((character) => character.charCodeAt(0) >= 32)
          .join('')
          .replace(/[<>:"/\\|?*]/g, '-')
          .trim()
        const result = await dialog.showSaveDialog({
          title: 'Exportar relatório DOCX',
          defaultPath: `${safeName || 'relatorio'}.docx`,
          filters: [{ name: 'Documento do Word', extensions: ['docx'] }],
        })
        if (result.canceled || !result.filePath) return null
        return result.filePath.toLocaleLowerCase().endsWith('.docx')
          ? result.filePath
          : `${result.filePath}.docx`
      },
    },
    { write: (filePath, content) => writeFile(filePath, content) },
  )
  ipcMain.handle('ai:generate', (_event, request: unknown) => generate(request))
  ipcMain.handle('ai:extract-report-information', (_event, request: unknown) =>
    extractReportInformation(request),
  )
  ipcMain.handle('ai:generate-report', (_event, request: unknown) =>
    generateReport(request),
  )
  ipcMain.handle('reports:export-docx', (_event, request: unknown) =>
    exportReport(request),
  )
}
