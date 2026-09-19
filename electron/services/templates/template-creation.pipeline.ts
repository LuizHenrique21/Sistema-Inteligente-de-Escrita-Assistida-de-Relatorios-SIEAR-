import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import type { DocumentRepresentation } from '../documents/types'
import type { TemplateImportProgress } from '../../../src/types/template-import'
import type { ReportTemplateBuilderInput } from './report-template.builder'

export interface PipelineDocumentExtractor {
  extract(filePath: string): Promise<DocumentRepresentation>
}

export interface PipelineStructureAnalyzer {
  analyze(document: DocumentRepresentation): Promise<StructurePattern>
}

export interface PipelineWritingAnalyzer {
  analyze(
    document: DocumentRepresentation,
    structure: StructurePattern,
  ): Promise<WritingPattern>
}

export interface PipelineSemanticAnalyzer {
  analyze(
    document: DocumentRepresentation,
    structure: StructurePattern,
    writing: WritingPattern,
  ): Promise<SemanticPattern>
}

export interface PipelineFormattingAnalyzer {
  analyze(document: DocumentRepresentation): FormattingPattern
}

export interface PipelineTemplateBuilder {
  build(input: ReportTemplateBuilderInput): ReportTemplate
}

export type TemplateCreationProgressListener = (
  progress: TemplateImportProgress,
) => void

export class TemplateCreationPipeline {
  constructor(
    private readonly extractor: PipelineDocumentExtractor,
    private readonly structureAnalyzer: PipelineStructureAnalyzer,
    private readonly writingAnalyzer: PipelineWritingAnalyzer,
    private readonly semanticAnalyzer: PipelineSemanticAnalyzer,
    private readonly formattingAnalyzer: PipelineFormattingAnalyzer,
    private readonly templateBuilder: PipelineTemplateBuilder,
  ) {}

  async execute(
    filePath: string,
    onProgress: TemplateCreationProgressListener = () => undefined,
  ): Promise<ReportTemplate> {
    const analysis = await this.runAnalysis(filePath, onProgress)

    onProgress({ step: 6, message: 'Construindo modelo...' })
    const template = this.templateBuilder.build(analysis)

    onProgress({ step: 7, message: 'Modelo pronto para revisão.' })
    return template
  }

  private async runAnalysis(
    filePath: string,
    onProgress: TemplateCreationProgressListener,
  ): Promise<ReportTemplateBuilderInput> {
    onProgress({ step: 1, message: 'Lendo documento...' })
    const document = await this.extractor.extract(filePath)

    onProgress({ step: 2, message: 'Analisando estrutura...' })
    const structure = await this.structureAnalyzer.analyze(document)

    onProgress({ step: 3, message: 'Analisando padrão de escrita...' })
    const writing = await this.writingAnalyzer.analyze(document, structure)

    onProgress({ step: 4, message: 'Analisando significado das seções...' })
    const semantic = await this.semanticAnalyzer.analyze(
      document,
      structure,
      writing,
    )

    onProgress({ step: 5, message: 'Analisando formatação...' })
    const formatting = this.formattingAnalyzer.analyze(document)

    return {
      document,
      structure,
      writing,
      semantic,
      formatting,
    }
  }
}
