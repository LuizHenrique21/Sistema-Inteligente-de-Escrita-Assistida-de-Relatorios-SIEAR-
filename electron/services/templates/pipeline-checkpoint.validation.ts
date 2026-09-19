import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import type { DocumentAnalysisContext } from '../documents/document-analysis-context'
import { isSemanticPattern } from '../ai/semantic-analysis.service'
import { isWritingPattern } from '../ai/writing-analysis.service'
import { buildSemanticAnalysisInput } from '../ai/prompts/semantic-analysis.prompt'
import { buildWritingAnalysisInput } from '../ai/prompts/writing-analysis.prompt'
import { isReportTemplate } from './report-template.validation'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isCheckpointDocument(
  value: unknown,
): value is DocumentRepresentation {
  return (
    isRecord(value) &&
    typeof value.fileName === 'string' &&
    (value.fileType === 'docx' || value.fileType === 'txt') &&
    typeof value.text === 'string' &&
    isRecord(value.metadata) &&
    Array.isArray(value.elements) &&
    Array.isArray(value.paragraphs) &&
    Array.isArray(value.sections) &&
    Array.isArray(value.headings) &&
    Array.isArray(value.lists) &&
    Array.isArray(value.tables) &&
    Array.isArray(value.figures) &&
    Array.isArray(value.headers) &&
    Array.isArray(value.footers) &&
    isRecord(value.pageInformation) &&
    isRecord(value.formatting) &&
    Array.isArray(value.styles)
  )
}

export function isCheckpointStructure(value: unknown): value is StructurePattern {
  return (
    isRecord(value) &&
    typeof value.documentType === 'string' &&
    Array.isArray(value.hierarchy) &&
    Array.isArray(value.sections) &&
    Array.isArray(value.activityPatterns) &&
    Array.isArray(value.fields) &&
    Array.isArray(value.recurringElements) &&
    Array.isArray(value.optionalElements) &&
    Array.isArray(value.requiredElements)
  )
}

export function isCheckpointFormatting(
  value: unknown,
): value is FormattingPattern {
  return (
    isRecord(value) &&
    isRecord(value.documentStyle) &&
    Array.isArray(value.headingStyles) &&
    Array.isArray(value.paragraphStyles) &&
    Array.isArray(value.listStyles) &&
    Array.isArray(value.tableStyles) &&
    Array.isArray(value.figureStyles) &&
    Array.isArray(value.captionStyles) &&
    Array.isArray(value.headerStyles) &&
    Array.isArray(value.footerStyles) &&
    Array.isArray(value.sourceStyleIds)
  )
}

export function isCheckpointWriting(
  value: unknown,
  document: DocumentRepresentation | DocumentAnalysisContext,
  structure: StructurePattern,
): value is WritingPattern {
  return isWritingPattern(value, buildWritingAnalysisInput(document, structure))
}

export function isCheckpointSemantic(
  value: unknown,
  document: DocumentRepresentation | DocumentAnalysisContext,
  structure: StructurePattern,
  writing: WritingPattern,
): value is SemanticPattern {
  return isSemanticPattern(
    value,
    buildSemanticAnalysisInput(document, structure, writing),
  )
}

export const checkpointResultValidators = {
  extraction: isCheckpointDocument,
  structure: isCheckpointStructure,
  formatting: isCheckpointFormatting,
  consolidation: isReportTemplate,
} as const
