import type { ReportTemplate } from '../../src/domain/templates/report-template'
import type {
  ExportReportDocxResult,
  GeneratedReport,
  GeneratedReportElement,
} from '../../src/types/generated-report'

export interface ReportExportTemplateFinder {
  getById(id: string): Promise<ReportTemplate | null>
}

export interface ReportDocxRenderer {
  render(report: GeneratedReport, template: ReportTemplate): Promise<Buffer>
}

export interface ReportDestinationSelector {
  select(report: GeneratedReport): Promise<string | null>
}

export interface ReportFileWriter {
  write(filePath: string, content: Buffer): Promise<void>
}

function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

function isElement(value: unknown): value is GeneratedReportElement {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const element = value as Record<string, unknown>
  if (element.type === 'paragraph') return nonEmpty(element.content)
  if (element.type === 'page-break') return true
  if (element.type === 'list')
    return (
      typeof element.ordered === 'boolean' &&
      Array.isArray(element.items) &&
      element.items.every(nonEmpty)
    )
  if (element.type === 'table')
    return (
      Array.isArray(element.rows) &&
      element.rows.every(
        (row) =>
          Array.isArray(row) && row.every((cell) => typeof cell === 'string'),
      ) &&
      Number.isInteger(element.headerRows)
    )
  return (
    element.type === 'figure' &&
    nonEmpty(element.dataBase64) &&
    (element.contentType === 'image/png' ||
      element.contentType === 'image/jpeg') &&
    nonEmpty(element.fileName) &&
    (element.caption === null || typeof element.caption === 'string')
  )
}

function isGeneratedReport(value: unknown): value is GeneratedReport {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const report = value as Record<string, unknown>
  return (
    nonEmpty(report.id) &&
    nonEmpty(report.templateId) &&
    nonEmpty(report.templateName) &&
    nonEmpty(report.createdAt) &&
    Array.isArray(report.sections) &&
    report.sections.every((section) => {
      if (
        typeof section !== 'object' ||
        section === null ||
        Array.isArray(section)
      )
        return false
      const item = section as Record<string, unknown>
      return (
        nonEmpty(item.id) &&
        nonEmpty(item.name) &&
        Number.isInteger(item.order) &&
        typeof item.content === 'string' &&
        (item.elements === undefined ||
          (Array.isArray(item.elements) && item.elements.every(isElement)))
      )
    })
  )
}

export function createReportExportHandler(
  templates: ReportExportTemplateFinder,
  renderer: ReportDocxRenderer,
  destination: ReportDestinationSelector,
  files: ReportFileWriter,
) {
  return async (request: unknown): Promise<ExportReportDocxResult> => {
    if (
      typeof request !== 'object' ||
      request === null ||
      !('report' in request) ||
      !isGeneratedReport(request.report)
    )
      return {
        success: false,
        error: {
          code: 'INVALID_REQUEST',
          message: 'O relatório informado para exportação é inválido.',
        },
      }

    const report = request.report
    let template: ReportTemplate | null
    try {
      template = await templates.getById(report.templateId)
    } catch (error: unknown) {
      console.error('[SIEAR] Falha ao buscar modelo para exportação:', error)
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Não foi possível preparar a exportação do relatório.',
        },
      }
    }
    if (!template)
      return {
        success: false,
        error: {
          code: 'TEMPLATE_NOT_FOUND',
          message: 'O modelo usado pelo relatório não foi encontrado.',
        },
      }

    let content: Buffer
    try {
      content = await renderer.render(report, template)
    } catch (error: unknown) {
      console.error('[SIEAR] Falha ao renderizar relatório DOCX:', error)
      return {
        success: false,
        error: {
          code: 'RENDER_ERROR',
          message: 'Não foi possível renderizar o relatório em DOCX.',
        },
      }
    }

    let filePath: string | null
    try {
      filePath = await destination.select(report)
    } catch (error: unknown) {
      console.error('[SIEAR] Falha ao selecionar destino do DOCX:', error)
      return {
        success: false,
        error: {
          code: 'UNEXPECTED_ERROR',
          message: 'Não foi possível selecionar o destino do relatório.',
        },
      }
    }
    if (!filePath)
      return {
        success: false,
        error: { code: 'CANCELED', message: 'Exportação cancelada.' },
      }
    try {
      await files.write(filePath, content)
      return { success: true, filePath }
    } catch (error: unknown) {
      console.error('[SIEAR] Falha ao gravar relatório DOCX:', error)
      return {
        success: false,
        error: {
          code: 'WRITE_ERROR',
          message: 'Não foi possível gravar o arquivo DOCX.',
        },
      }
    }
  }
}
