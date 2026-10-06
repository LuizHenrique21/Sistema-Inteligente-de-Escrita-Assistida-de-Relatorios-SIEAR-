import { describe, expect, it, vi } from 'vitest'
import type {
  FormattingPattern,
  SemanticPattern,
  StructurePattern,
  WritingPattern,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import { InMemoryPipelineCheckpointRepository } from '../../repositories/checkpoints/in-memory-pipeline-checkpoint.repository'
import { PipelineCheckpointCoordinator } from './pipeline-checkpoint.coordinator'
import {
  createPipelineCheckpointCompatibility,
  type PipelineCheckpointCompatibility,
} from './pipeline-checkpoint.config'
import type { PipelineCheckpoint } from './pipeline-checkpoint.types'
import { ReportTemplateBuilder } from './report-template.builder'
import { TemplateCreationPipeline } from './template-creation.pipeline'

const document: DocumentRepresentation = {
  fileName: 'modelo.docx',
  fileType: 'docx',
  text: '',
  metadata: {
    fileSize: 100,
    extractedAt: '2026-08-24T00:00:00.000Z',
    title: null,
    author: null,
    createdAt: null,
    modifiedAt: null,
  },
  elements: [],
  paragraphs: [],
  sections: [],
  headings: [],
  lists: [],
  tables: [],
  figures: [],
  headers: [],
  footers: [],
  pageInformation: {
    widthPt: null,
    heightPt: null,
    orientation: null,
    margins: { topPt: null, rightPt: null, bottomPt: null, leftPt: null },
    pageBreakCount: 0,
    hasPageNumbering: false,
  },
  formatting: { defaultParagraph: {} },
  styles: [],
}

const structure: StructurePattern = {
  documentType: 'Relatório',
  mainTitle: null,
  hierarchy: [],
  sections: [],
  activityPatterns: [],
  fields: [],
  recurringElements: [],
  optionalElements: [],
  requiredElements: [],
}

const style = {
  tone: 'formal',
  formality: 'alta',
  technicality: 'média',
  objectivity: 'alta',
  averageParagraphWords: 0,
  sentenceComplexity: 'simples',
  grammaticalPerson: 'terceira pessoa',
  verbTense: 'pretérito',
  voice: 'ativa',
  firstPersonUsage: 'ausente',
  thirdPersonUsage: 'predominante',
  detailLevel: 'objetivo',
  narrativeStyle: 'técnico',
  evidence: [],
}

const writing: WritingPattern = {
  globalStyle: style,
  sectionStyles: [],
  vocabulary: [],
  terminology: [],
  sentencePatterns: [],
  paragraphPatterns: [],
  narrativePatterns: [],
  forbiddenPatterns: [],
  recommendedPatterns: [],
}

const semantic: SemanticPattern = {
  documentType: 'Relatório',
  sections: [],
  activityPatterns: [],
  fields: [],
  crossSectionRelations: [],
  uncertainties: [],
}

const formatting: FormattingPattern = {
  documentStyle: {
    predominantFont: null,
    predominantFontSizePt: null,
    sectionFonts: [],
    pageWidthPt: null,
    pageHeightPt: null,
    orientation: null,
    margins: { topPt: null, rightPt: null, bottomPt: null, leftPt: null },
    hasPageNumbering: false,
    pageBreakCount: 0,
    pageBreakBeforeSections: [],
  },
  headingStyles: [],
  paragraphStyles: [],
  listStyles: [],
  tableStyles: [],
  figureStyles: [],
  captionStyles: [],
  headerStyles: [],
  footerStyles: [],
  sourceStyleIds: [],
}

function harness(options: {
  repository?: InMemoryPipelineCheckpointRepository
  compatibility?: PipelineCheckpointCompatibility
  semanticFailure?: Error
  documentHash?: (path: string) => Promise<string>
} = {}) {
  const repository =
    options.repository ?? new InMemoryPipelineCheckpointRepository()
  const compatibility =
    options.compatibility ?? createPipelineCheckpointCompatibility('model-a')
  const extractor = { extract: vi.fn().mockResolvedValue(document) }
  const structureAnalyzer = { analyze: vi.fn().mockResolvedValue(structure) }
  const writingAnalyzer = { analyze: vi.fn().mockResolvedValue(writing) }
  const semanticAnalyzer = {
    analyze: options.semanticFailure
      ? vi
          .fn()
          .mockRejectedValueOnce(options.semanticFailure)
          .mockResolvedValue(semantic)
      : vi.fn().mockResolvedValue(semantic),
  }
  const formattingAnalyzer = { analyze: vi.fn().mockReturnValue(formatting) }
  const builder = new ReportTemplateBuilder()
  const build = vi.spyOn(builder, 'build')
  const pipeline = new TemplateCreationPipeline(
    extractor,
    structureAnalyzer,
    writingAnalyzer,
    semanticAnalyzer,
    formattingAnalyzer,
    builder,
    {
      coordinator: new PipelineCheckpointCoordinator(
        repository,
        compatibility,
      ),
      hashDocument:
        options.documentHash ??
        (async (filePath) =>
          filePath.includes('outro') ? 'hash-documento-b' : 'hash-documento-a'),
    },
  )
  return {
    repository,
    compatibility,
    pipeline,
    extractor,
    structureAnalyzer,
    writingAnalyzer,
    semanticAnalyzer,
    formattingAnalyzer,
    build,
  }
}

function completedCheckpoint(
  calls: Array<[PipelineCheckpoint]>,
  stage: PipelineCheckpoint['stage'],
): PipelineCheckpoint {
  const checkpoint = calls
    .map(([value]) => value)
    .reverse()
    .find((value) => value.stage === stage && value.status === 'completed')
  if (!checkpoint) throw new Error(`Checkpoint ${stage} não encontrado.`)
  return structuredClone(checkpoint)
}

describe('TemplateCreationPipeline com checkpoint', () => {
  it('executa e persiste todas as seis etapas na primeira execução', async () => {
    const context = harness()
    const save = vi.spyOn(context.repository, 'save')

    await context.pipeline.execute('modelo.docx')

    expect(context.extractor.extract).toHaveBeenCalledOnce()
    expect(context.structureAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.writingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.semanticAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.formattingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.build).toHaveBeenCalledOnce()
    expect(
      save.mock.calls
        .map(([checkpoint]) => checkpoint)
        .filter((checkpoint) => checkpoint.status === 'completed')
        .map((checkpoint) => checkpoint.stage),
    ).toEqual([
      'extraction',
      'structure',
      'writing',
      'semantic',
      'formatting',
      'consolidation',
    ])
  })

  it('reutiliza extraction, structure e writing sem chamar os serviços', async () => {
    const context = harness()
    await context.pipeline.execute('modelo.docx')
    await context.pipeline.execute('modelo.docx')

    expect(context.extractor.extract).toHaveBeenCalledOnce()
    expect(context.structureAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.writingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.semanticAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.formattingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.build).toHaveBeenCalledOnce()
  })

  it('preserva etapas válidas, registra falha sem conteúdo e retoma semantic', async () => {
    const secret = 'conteúdo sigiloso do documento'
    const failure = Object.assign(new Error(secret), {
      code: 'INVALID_SEMANTIC_ANALYSIS',
    })
    const context = harness({ semanticFailure: failure })
    const save = vi.spyOn(context.repository, 'save')

    await expect(context.pipeline.execute('modelo.docx')).rejects.toBe(failure)
    const failed = save.mock.calls
      .map(([checkpoint]) => checkpoint)
      .reverse()
      .find(
        (checkpoint) =>
          checkpoint.stage === 'semantic' && checkpoint.status === 'failed',
      )
    expect(failed).toMatchObject({
      result: null,
      resultHash: null,
      error: {
        name: 'Error',
        code: 'INVALID_SEMANTIC_ANALYSIS',
      },
    })
    expect(JSON.stringify(failed)).not.toContain(secret)

    await context.pipeline.execute('modelo.docx')

    expect(context.extractor.extract).toHaveBeenCalledOnce()
    expect(context.structureAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.writingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.semanticAnalyzer.analyze).toHaveBeenCalledTimes(2)
    expect(context.formattingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(context.build).toHaveBeenCalledOnce()
  })

  it('invalida a etapa quando a versão do prompt muda', async () => {
    const first = harness()
    await first.pipeline.execute('modelo.docx')
    const changed = structuredClone(first.compatibility)
    changed.semantic.promptVersion = '2'
    const second = harness({
      repository: first.repository,
      compatibility: changed,
    })

    await second.pipeline.execute('modelo.docx')

    expect(second.extractor.extract).not.toHaveBeenCalled()
    expect(second.structureAnalyzer.analyze).not.toHaveBeenCalled()
    expect(second.writingAnalyzer.analyze).not.toHaveBeenCalled()
    expect(second.semanticAnalyzer.analyze).toHaveBeenCalledOnce()
  })

  it('invalida a etapa quando a versão do analyzer muda', async () => {
    const first = harness()
    await first.pipeline.execute('modelo.docx')
    const changed = structuredClone(first.compatibility)
    changed.writing.analyzerVersion = 'changed-writing-analyzer'
    const second = harness({
      repository: first.repository,
      compatibility: changed,
    })

    await second.pipeline.execute('modelo.docx')

    expect(second.extractor.extract).not.toHaveBeenCalled()
    expect(second.structureAnalyzer.analyze).not.toHaveBeenCalled()
    expect(second.writingAnalyzer.analyze).toHaveBeenCalledOnce()
  })

  it('invalida análises Ollama quando o modelo muda', async () => {
    const first = harness()
    await first.pipeline.execute('modelo.docx')
    const second = harness({
      repository: first.repository,
      compatibility: createPipelineCheckpointCompatibility('model-b'),
    })

    await second.pipeline.execute('modelo.docx')

    expect(second.extractor.extract).not.toHaveBeenCalled()
    expect(second.structureAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(second.writingAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(second.semanticAnalyzer.analyze).toHaveBeenCalledOnce()
    expect(second.formattingAnalyzer.analyze).not.toHaveBeenCalled()
  })

  it('invalida a etapa quando a configuração relevante muda', async () => {
    const first = harness()
    await first.pipeline.execute('modelo.docx')
    const changed = structuredClone(first.compatibility)
    changed.writing.configurationHash = 'nova-configuração'
    const second = harness({
      repository: first.repository,
      compatibility: changed,
    })

    await second.pipeline.execute('modelo.docx')

    expect(second.extractor.extract).not.toHaveBeenCalled()
    expect(second.structureAnalyzer.analyze).not.toHaveBeenCalled()
    expect(second.writingAnalyzer.analyze).toHaveBeenCalledOnce()
  })

  it('não reutiliza checkpoints quando o hash do DOCX muda', async () => {
    const context = harness()
    await context.pipeline.execute('modelo.docx')
    await context.pipeline.execute('outro.docx')

    expect(context.extractor.extract).toHaveBeenCalledTimes(2)
    expect(context.structureAnalyzer.analyze).toHaveBeenCalledTimes(2)
    expect(context.writingAnalyzer.analyze).toHaveBeenCalledTimes(2)
    expect(context.semanticAnalyzer.analyze).toHaveBeenCalledTimes(2)
  })

  it('descarta checkpoint corrompido e executa novamente', async () => {
    const context = harness()
    const save = vi.spyOn(context.repository, 'save')
    await context.pipeline.execute('modelo.docx')
    const extraction = completedCheckpoint(save.mock.calls, 'extraction')
    await context.repository.save({ ...extraction, resultHash: 'corrompido' })

    await context.pipeline.execute('modelo.docx')

    expect(context.extractor.extract).toHaveBeenCalledTimes(2)
  })

  it('não reutiliza checkpoint parcial em estado running', async () => {
    const context = harness()
    const save = vi.spyOn(context.repository, 'save')
    await context.pipeline.execute('modelo.docx')
    const structureCheckpoint = completedCheckpoint(
      save.mock.calls,
      'structure',
    )
    await context.repository.save({
      ...structureCheckpoint,
      status: 'running',
      result: null,
      resultHash: null,
    })

    await context.pipeline.execute('modelo.docx')

    expect(context.structureAnalyzer.analyze).toHaveBeenCalledTimes(2)
  })

  it('não permite vazamento de resultado entre documentos', async () => {
    const context = harness()
    await context.pipeline.execute('modelo.docx')
    await context.pipeline.execute('outro.docx')

    expect(context.extractor.extract.mock.calls).toEqual([
      ['modelo.docx'],
      ['outro.docx'],
    ])
  })
})
