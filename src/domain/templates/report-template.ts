import type { FormattingPattern } from './formatting-pattern'
import type { SemanticPattern } from './semantic-pattern'
import type {
  ActivityPattern,
  StructureField,
  StructurePattern,
} from './structure-pattern'
import type { WritingPattern } from './writing-pattern'

/** Versão atual do contrato oficial de templates ricos do SIEAR. */
export const REPORT_TEMPLATE_VERSION = 2 as const

export type ReportTemplateStatus = 'draft' | 'confirmed'

/** Datas usam ISO 8601 para manter o contrato serializável pelo IPC. */
export interface ReportTemplateMetadata {
  id: string
  name: string
  description: string
  documentType: string
  status: ReportTemplateStatus
  createdAt: string
  updatedAt: string
}

export interface ReportTemplateRequirements {
  requiredElements: string[]
  optionalElements: string[]
  repeatableElements: string[]
}

/**
 * Contrato oficial de um modelo aprendido a partir de um único documento.
 * Estrutura/campos/atividades representam conteúdo reutilizável; os padrões
 * semântico, de escrita e de formatação preservam significado e apresentação.
 * Conteúdo de relatórios gerados não pertence a este contrato.
 */
export interface ReportTemplate {
  version: typeof REPORT_TEMPLATE_VERSION
  metadata: ReportTemplateMetadata
  structurePattern: StructurePattern
  writingPattern: WritingPattern
  semanticPattern: SemanticPattern
  formattingPattern: FormattingPattern
  fields: StructureField[]
  activityPatterns: ActivityPattern[]
  requirements: ReportTemplateRequirements
}
