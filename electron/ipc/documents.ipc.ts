import { dialog, ipcMain } from 'electron'
import type { ImportTemplateResult } from '../../src/types/template-import'
import {
  TemplateAnalysisError,
  TemplateAnalysisService,
} from '../services/ai/template-analysis.service'
import { DocumentExtractionError } from '../services/documents/document-errors'
import { DocumentExtractorService } from '../services/documents/document-extractor.service'
import {
  OllamaService,
  OllamaServiceError,
} from '../services/ollama/ollama.service'
import { TemplateMapper } from '../services/templates/template.mapper'

const extractor = new DocumentExtractorService()
const analyzer = new TemplateAnalysisService(new OllamaService())
const mapper = new TemplateMapper()

async function selectAndAnalyzeTemplate(): Promise<ImportTemplateResult> {
  const selection = await dialog.showOpenDialog({
    title: 'Importar relatório existente',
    properties: ['openFile'],
    filters: [{ name: 'Documento do Word', extensions: ['docx'] }],
  })
  if (selection.canceled || !selection.filePaths[0]) {
    return {
      success: false,
      canceled: true,
      error: { code: 'CANCELED', message: 'Seleção cancelada.' },
    }
  }

  try {
    const document = await extractor.extract(selection.filePaths[0])
    const analysis = await analyzer.analyze(document)
    return {
      success: true,
      data: mapper.toReportTemplate(analysis),
      fileName: document.fileName,
    }
  } catch (error: unknown) {
    if (
      error instanceof DocumentExtractionError ||
      error instanceof TemplateAnalysisError ||
      error instanceof OllamaServiceError
    ) {
      return {
        success: false,
        error: { code: error.code, message: error.message },
      }
    }
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: 'Ocorreu um erro inesperado ao importar o documento.',
      },
    }
  }
}

export function registerDocumentsIpc(): void {
  ipcMain.handle('documents:select-and-analyze-template', () =>
    selectAndAnalyzeTemplate(),
  )
}
