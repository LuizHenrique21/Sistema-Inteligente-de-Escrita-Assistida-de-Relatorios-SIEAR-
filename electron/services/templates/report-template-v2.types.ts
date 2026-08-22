import type { FormattingPattern } from '../documents/formatting-analysis.types'
import type { SemanticPattern } from '../documents/semantic-analysis.types'
import type {
  ActivityPattern,
  StructureField,
  StructurePattern,
} from '../documents/structure-analysis.types'
import type { WritingPattern } from '../documents/writing-analysis.types'

export const REPORT_TEMPLATE_V2_VERSION = 2 as const

export type ReportTemplateV2Status = 'draft' | 'confirmed'

/**
 * Identifica e controla o ciclo de vida do modelo aprendido. Datas devem usar
 * o formato ISO 8601 para que o contrato permaneça serializável.
 */
export interface ReportTemplateV2Metadata {
  id: string
  name: string
  description: string
  documentType: string
  status: ReportTemplateV2Status
  createdAt: string
  updatedAt: string
}

/**
 * Consolida a presença esperada dos elementos sem converter as evidências e
 * os padrões especializados em regras textuais.
 */
export interface ReportTemplateV2Requirements {
  requiredElements: string[]
  optionalElements: string[]
  repeatableElements: string[]
}

/**
 * Contrato canônico de um modelo aprendido a partir de um único documento.
 *
 * CONTENT é representado por estrutura, campos, atividades e requisitos.
 * SEMANTICS é representado por semanticPattern.
 * PRESENTATION é representado por writingPattern e formattingPattern.
 *
 * O contrato contém apenas conhecimento reutilizável. Conteúdo de um relatório
 * gerado pertence a GeneratedReport e não deve ser armazenado aqui.
 */
export interface ReportTemplateV2 {
  version: typeof REPORT_TEMPLATE_V2_VERSION
  metadata: ReportTemplateV2Metadata
  structurePattern: StructurePattern
  writingPattern: WritingPattern
  semanticPattern: SemanticPattern
  formattingPattern: FormattingPattern
  fields: StructureField[]
  activityPatterns: ActivityPattern[]
  requirements: ReportTemplateV2Requirements
}
