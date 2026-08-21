import { ipcMain } from 'electron'
import { ReportExtractionService } from '../services/ai/report-extraction.service'
import { OllamaService } from '../services/ollama/ollama.service'
import { createAiGenerateHandler } from './ai.handler'
import { createReportExtractionHandler } from './report-extraction.handler'

const ollamaService = new OllamaService()
const generate = createAiGenerateHandler(ollamaService)
const reportExtractionService = new ReportExtractionService(ollamaService)
const extractReportInformation = createReportExtractionHandler(
  reportExtractionService,
)

export function registerAiIpc(): void {
  ipcMain.handle('ai:generate', (_event, request: unknown) => generate(request))
  ipcMain.handle('ai:extract-report-information', (_event, request: unknown) =>
    extractReportInformation(request),
  )
}
