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
import { getLogger } from '../../infrastructure/logging/logger.runtime'
import { serializeError } from '../../infrastructure/logging/log-sanitizer'
import { combineCheckpointHashes, hashCheckpointResult, hashDocumentFile } from './pipeline-checkpoint.hash'
import type { PipelineCheckpointCoordinator } from './pipeline-checkpoint.coordinator'
import {
  checkpointResultValidators,
  isCheckpointSemantic,
  isCheckpointWriting,
} from './pipeline-checkpoint.validation'

const logger = getLogger('TemplateCreationPipeline')

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

export interface TemplateCreationCheckpointing {
  coordinator: PipelineCheckpointCoordinator
  hashDocument?: (filePath: string) => Promise<string>
}

interface PipelineAnalysisResult extends ReportTemplateBuilderInput {
  documentHash: string
  resultHashes: {
    document: string
    structure: string
    writing: string
    semantic: string
    formatting: string
  }
  coordinator: PipelineCheckpointCoordinator | null
}

export class TemplateCreationPipeline {
  constructor(
    private readonly extractor: PipelineDocumentExtractor,
    private readonly structureAnalyzer: PipelineStructureAnalyzer,
    private readonly writingAnalyzer: PipelineWritingAnalyzer,
    private readonly semanticAnalyzer: PipelineSemanticAnalyzer,
    private readonly formattingAnalyzer: PipelineFormattingAnalyzer,
    private readonly templateBuilder: PipelineTemplateBuilder,
    private readonly checkpointing?: TemplateCreationCheckpointing,
  ) {}

  async execute(
    filePath: string,
    onProgress: TemplateCreationProgressListener = () => undefined,
  ): Promise<ReportTemplate> {
    const total = logger.startTimer('Template creation')
    logger.info('Template creation started', { extension: '.docx' })
    try {
      const analysis = await this.runAnalysis(filePath, onProgress)

      onProgress({ step: 6, message: 'Construindo modelo...' })
      const buildTimer = logger.startTimer('Template build')
      const buildInput: ReportTemplateBuilderInput = {
        document: analysis.document,
        structure: analysis.structure,
        writing: analysis.writing,
        semantic: analysis.semantic,
        formatting: analysis.formatting,
      }
      const templateStage = await this.runStage(
        analysis.coordinator,
        'consolidation',
        analysis.documentHash,
        combineCheckpointHashes(
          analysis.resultHashes.document,
          analysis.resultHashes.structure,
          analysis.resultHashes.writing,
          analysis.resultHashes.semantic,
          analysis.resultHashes.formatting,
        ),
        () => this.templateBuilder.build(buildInput),
        checkpointResultValidators.consolidation,
      )
      const template = templateStage.value
      buildTimer.end('Template build completed')

      onProgress({ step: 7, message: 'Modelo pronto para revisão.' })
      total.end('Template creation completed', {
        templateId: template.metadata.id,
      })
      return template
    } catch (error: unknown) {
      logger.error('Template creation failed', { error: serializeError(error) })
      throw error
    }
  }

  private async runAnalysis(
    filePath: string,
    onProgress: TemplateCreationProgressListener,
  ): Promise<PipelineAnalysisResult> {
    onProgress({ step: 1, message: 'Lendo documento...' })
    let coordinator = this.checkpointing?.coordinator ?? null
    let documentHash = ''
    if (coordinator) {
      try {
        documentHash = await (
          this.checkpointing?.hashDocument ?? hashDocumentFile
        )(filePath)
      } catch {
        logger.warn('Document hash unavailable; checkpointing disabled')
        coordinator = null
      }
    }
    const extractionTimer = logger.startTimer('Document extraction')
    const documentStage = await this.runStage(
      coordinator,
      'extraction',
      documentHash,
      documentHash,
      () => this.extractor.extract(filePath),
      checkpointResultValidators.extraction,
    )
    const document = documentStage.value
    extractionTimer.end('Document extraction completed', {
      sections: document.sections?.length ?? 0,
      paragraphs: document.paragraphs?.length ?? 0,
      tables: document.tables?.length ?? 0,
      figures: document.figures?.length ?? 0,
    })

    onProgress({ step: 2, message: 'Analisando estrutura...' })
    const structureTimer = logger.startTimer('Structure analysis')
    const structureStage = await this.runStage(
      coordinator,
      'structure',
      documentHash,
      combineCheckpointHashes(documentStage.resultHash),
      () => this.structureAnalyzer.analyze(document),
      checkpointResultValidators.structure,
    )
    const structure = structureStage.value
    structureTimer.end('Structure analysis completed', {
      sections: structure.sections?.length ?? 0,
      fields: structure.fields?.length ?? 0,
      activities: structure.activityPatterns?.length ?? 0,
    })

    onProgress({ step: 3, message: 'Analisando padrão de escrita...' })
    const writingTimer = logger.startTimer('Writing analysis')
    const writingStage = await this.runStage(
      coordinator,
      'writing',
      documentHash,
      combineCheckpointHashes(
        documentStage.resultHash,
        structureStage.resultHash,
      ),
      () => this.writingAnalyzer.analyze(document, structure),
      (value): value is WritingPattern =>
        isCheckpointWriting(value, document, structure),
    )
    const writing = writingStage.value
    writingTimer.end('Writing analysis completed', {
      sectionStyles: writing.sectionStyles?.length ?? 0,
      rules:
        (writing.recommendedPatterns?.length ?? 0) +
        (writing.forbiddenPatterns?.length ?? 0),
    })

    onProgress({ step: 4, message: 'Analisando significado das seções...' })
    const semanticTimer = logger.startTimer('Semantic analysis')
    const semanticStage = await this.runStage(
      coordinator,
      'semantic',
      documentHash,
      combineCheckpointHashes(
        documentStage.resultHash,
        structureStage.resultHash,
        writingStage.resultHash,
      ),
      () => this.semanticAnalyzer.analyze(document, structure, writing),
      (value): value is SemanticPattern =>
        isCheckpointSemantic(value, document, structure, writing),
    )
    const semantic = semanticStage.value
    semanticTimer.end('Semantic analysis completed', {
      sections: semantic.sections?.length ?? 0,
      relations: semantic.crossSectionRelations?.length ?? 0,
    })

    onProgress({ step: 5, message: 'Analisando formatação...' })
    const formattingTimer = logger.startTimer('Formatting analysis')
    const formattingStage = await this.runStage(
      coordinator,
      'formatting',
      documentHash,
      combineCheckpointHashes(documentStage.resultHash),
      () => this.formattingAnalyzer.analyze(document),
      checkpointResultValidators.formatting,
    )
    const formatting = formattingStage.value
    formattingTimer.end('Formatting analysis completed', {
      headingStyles: formatting.headingStyles?.length ?? 0,
      paragraphStyles: formatting.paragraphStyles?.length ?? 0,
      headers: formatting.headerStyles?.length ?? 0,
      footers: formatting.footerStyles?.length ?? 0,
    })

    return {
      document,
      structure,
      writing,
      semantic,
      formatting,
      documentHash,
      coordinator,
      resultHashes: {
        document: documentStage.resultHash,
        structure: structureStage.resultHash,
        writing: writingStage.resultHash,
        semantic: semanticStage.resultHash,
        formatting: formattingStage.resultHash,
      },
    }
  }

  private async runStage<T>(
    coordinator: PipelineCheckpointCoordinator | null,
    stage: Parameters<PipelineCheckpointCoordinator['run']>[0],
    documentHash: string,
    inputHash: string,
    operation: () => T | Promise<T>,
    validator: (value: unknown) => value is T,
  ): Promise<{ value: T; resultHash: string; reused: boolean }> {
    if (coordinator)
      return coordinator.run(
        stage,
        documentHash,
        inputHash,
        operation,
        validator,
      )
    const value = await operation()
    return {
      value,
      resultHash: hashCheckpointResult(value),
      reused: false,
    }
  }
}
