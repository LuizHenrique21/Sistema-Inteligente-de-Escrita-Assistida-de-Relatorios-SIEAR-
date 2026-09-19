import path from 'node:path'
import { dialog, ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { ImportTemplateResult } from '../../src/types/template-import'
import {
  SemanticAnalysisError,
  SemanticAnalysisService,
} from '../services/ai/semantic-analysis.service'
import {
  WritingAnalysisError,
  WritingAnalysisService,
} from '../services/ai/writing-analysis.service'
import { DocumentExtractionError } from '../services/documents/document-errors'
import { DocumentExtractorService } from '../services/documents/document-extractor.service'
import { FormattingAnalysisService } from '../services/documents/formatting-analysis.service'
import {
  StructureAnalysisError,
  StructureAnalysisService,
} from '../services/documents/structure-analysis.service'
import {
  OllamaService,
  OllamaServiceError,
} from '../services/ollama/ollama.service'
import { ReportTemplateBuilder } from '../services/templates/report-template.builder'
import { TemplateCreationPipeline } from '../services/templates/template-creation.pipeline'

const extractor = new DocumentExtractorService()
const ollama = new OllamaService()
const structureAnalyzer = new StructureAnalysisService(ollama)
const writingAnalyzer = new WritingAnalysisService(ollama)
const semanticAnalyzer = new SemanticAnalysisService(ollama)
const formattingAnalyzer = new FormattingAnalysisService()
const templateBuilder = new ReportTemplateBuilder()
const pipeline = new TemplateCreationPipeline(
  extractor,
  structureAnalyzer,
  writingAnalyzer,
  semanticAnalyzer,
  formattingAnalyzer,
  templateBuilder,
)

function logImportError(error: unknown): void {
  const details =
    error instanceof Error
      ? { name: error.name, message: error.message, stack: error.stack }
      : { value: String(error) }
  console.error('[SIEAR] Falha no pipeline de criação de modelo:', details)
}

async function selectAndAnalyzeTemplate(
  event: IpcMainInvokeEvent,
): Promise<ImportTemplateResult> {
  let selection
  try {
    selection = await dialog.showOpenDialog({
      title: 'Importar relatório existente',
      properties: ['openFile'],
      filters: [{ name: 'Documento do Word', extensions: ['docx'] }],
    })
  } catch (error: unknown) {
    logImportError(error)
    return {
      success: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: 'Não foi possível abrir o seletor de documentos.',
      },
    }
  }
  if (selection.canceled) {
    return {
      success: false,
      canceled: true,
      error: { code: 'CANCELED', message: 'Seleção cancelada.' },
    }
  }
  if (
    selection.filePaths.length !== 1 ||
    path.extname(selection.filePaths[0] ?? '').toLocaleLowerCase() !== '.docx'
  ) {
    return {
      success: false,
      error: {
        code: 'INVALID_SELECTION',
        message: 'Selecione exatamente um arquivo DOCX.',
      },
    }
  }

  try {
    const filePath = selection.filePaths[0]
    const template = await pipeline.execute(filePath, (progress) => {
      if (!event.sender.isDestroyed()) {
        event.sender.send('documents:template-import-progress', progress)
      }
    })
    return {
      success: true,
      data: template,
      fileName: path.basename(filePath),
    }
  } catch (error: unknown) {
    logImportError(error)
    if (
      error instanceof DocumentExtractionError ||
      error instanceof StructureAnalysisError ||
      error instanceof WritingAnalysisError ||
      error instanceof SemanticAnalysisError ||
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
  ipcMain.handle('documents:select-and-analyze-template', (event) =>
    selectAndAnalyzeTemplate(event),
  )
}
