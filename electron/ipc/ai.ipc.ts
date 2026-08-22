import { ipcMain } from 'electron'
import { ReportExtractionService } from '../services/ai/report-extraction.service'
import { ReportGenerationService } from '../services/ai/report-generation.service'
import { OllamaService } from '../services/ollama/ollama.service'
import { reportTemplateService } from '../services/templates/report-template.container'
import { createAiGenerateHandler } from './ai.handler'
import { createReportExtractionHandler } from './report-extraction.handler'
import { createReportGenerationHandler } from './report-generation.handler'

const ollamaService = new OllamaService()
const generate = createAiGenerateHandler(ollamaService)
const reportExtractionService = new ReportExtractionService(ollamaService)
const extractReportInformation = createReportExtractionHandler(
  reportExtractionService,
)
const reportGenerationService = new ReportGenerationService(ollamaService)
const generateReport = createReportGenerationHandler(
  reportGenerationService,
  reportTemplateService,
)

export function registerAiIpc(): void {
  ipcMain.handle('ai:generate', (_event, request: unknown) => generate(request))
  ipcMain.handle('ai:extract-report-information', (_event, request: unknown) =>
    extractReportInformation(request),
  )
  ipcMain.handle('ai:generate-report', (_event, request: unknown) =>
    generateReport(request),
  )
}
