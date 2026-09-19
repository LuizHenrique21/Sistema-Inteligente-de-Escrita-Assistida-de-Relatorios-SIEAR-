import { ipcMain } from 'electron'
import { ReportExtractionService } from '../services/ai/report-extraction.service'
import { LearnedReportGenerationService } from '../services/ai/learned-report-generation.service'
import { UserInformationExtractor } from '../services/ai/user-information-extractor'
import { OllamaService } from '../services/ollama/ollama.service'
import { reportTemplateService } from '../services/templates/report-template.container'
import { LearnedReportGenerationPipeline } from '../services/reports/learned-report-generation.pipeline'
import { ReportGenerationPlanner } from '../services/reports/report-generation-planner'
import { createAiGenerateHandler } from './ai.handler'
import { createReportExtractionHandler } from './report-extraction.handler'
import { createReportGenerationHandler } from './report-generation.handler'

const ollamaService = new OllamaService()
const generate = createAiGenerateHandler(ollamaService)
const reportExtractionService = new ReportExtractionService(ollamaService)
const extractReportInformation = createReportExtractionHandler(
  reportExtractionService,
)
const learnedReportPipeline = new LearnedReportGenerationPipeline(
  new UserInformationExtractor(ollamaService),
  new ReportGenerationPlanner(),
  new LearnedReportGenerationService(ollamaService),
)
const generateReport = createReportGenerationHandler(
  learnedReportPipeline,
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
