import type { TemplateImportProgress } from './template-import'

export interface ReportTemplateV2IpcMetadata {
  id: string
  name: string
  description: string
  documentType: string
  status: 'draft' | 'confirmed'
  createdAt: string
  updatedAt: string
}

/** Snapshot serializável. Os padrões ricos permanecem opacos nesta fronteira
 * até que seus contratos canônicos sejam movidos para um módulo compartilhado. */
export interface ReportTemplateV2Snapshot {
  version: number
  metadata: ReportTemplateV2IpcMetadata
  structurePattern: object
  writingPattern: object
  semanticPattern: object
  formattingPattern: object
  fields: object[]
  activityPatterns: object[]
  requirements: {
    requiredElements: string[]
    optionalElements: string[]
    repeatableElements: string[]
  }
}

export interface TemplatesV2Error {
  code: string
  message: string
}

export type TemplatesV2Result<T> =
  | { success: true; data: T }
  | { success: false; error: TemplatesV2Error }

export interface CreateTemplateV2FromDocumentRequest {
  filePath: string
  requestId?: string
}

export interface TemplatesV2Api {
  createFromDocument(
    request: CreateTemplateV2FromDocumentRequest,
  ): Promise<TemplatesV2Result<ReportTemplateV2Snapshot>>
  onCreationProgress(
    listener: (progress: TemplateImportProgress) => void,
  ): () => void
  getAll(): Promise<TemplatesV2Result<ReportTemplateV2Snapshot[]>>
  getById(
    id: string,
  ): Promise<TemplatesV2Result<ReportTemplateV2Snapshot | null>>
  update(
    template: ReportTemplateV2Snapshot,
  ): Promise<TemplatesV2Result<ReportTemplateV2Snapshot>>
  confirm(
    id: string,
  ): Promise<TemplatesV2Result<ReportTemplateV2Snapshot>>
  delete(id: string): Promise<TemplatesV2Result<null>>
}
