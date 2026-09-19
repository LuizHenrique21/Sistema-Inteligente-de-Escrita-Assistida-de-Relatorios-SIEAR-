import type {
  ExportReportDocxRequest,
  GenerateReportRequest,
} from '../types/generated-report'
import type { ExtractReportInformationRequest } from '../types/siear-api'

export const aiService = {
  extractReportInformation: (request: ExtractReportInformationRequest) =>
    window.siear.ai.extractReportInformation(request),
  generateReport: (request: GenerateReportRequest) =>
    window.siear.ai.generateReport(request),
  exportReportDocx: (request: ExportReportDocxRequest) =>
    window.siear.ai.exportReportDocx(request),
}
