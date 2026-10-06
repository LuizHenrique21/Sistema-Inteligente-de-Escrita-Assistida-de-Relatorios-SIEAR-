import { describe, expect, it, vi } from 'vitest'
import type {
  SemanticPattern,
  StructurePattern,
  WritingPattern,
  WritingStyleProfile,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import { buildSemanticAnalysisInput } from './prompts/semantic-analysis.prompt'
import { SemanticAnalysisService } from './semantic-analysis.service'
import { InMemoryPipelineCheckpointRepository } from '../../repositories/checkpoints/in-memory-pipeline-checkpoint.repository'
import { PipelineCheckpointCoordinator } from '../templates/pipeline-checkpoint.coordinator'
import { createPipelineCheckpointCompatibility } from '../templates/pipeline-checkpoint.config'

const sample = 'A manutenção foi executada conforme o procedimento técnico.'
const document: DocumentRepresentation = {
  fileName: 'modelo.docx',
  fileType: 'docx',
  text: `DOCUMENTO BRUTO: ${sample}`,
  metadata: {
    fileSize: 500,
    extractedAt: '2026-08-21T00:00:00.000Z',
    title: 'Relatório',
    author: null,
    createdAt: null,
    modifiedAt: null,
  },
  elements: [],
  paragraphs: [
    {
      id: 'owner',
      text: 'Responsável: João Silva',
      order: 1,
      style: 'paragraph',
      headingLevel: null,
      sectionId: 'description',
      numbering: null,
      formatting: {
        fontFamily: null,
        fontSizePt: null,
        bold: false,
        italic: false,
        underline: false,
        alignment: null,
        lineSpacing: null,
        spaceBeforePt: null,
        spaceAfterPt: null,
        indentLeftPt: null,
        indentRightPt: null,
        firstLineIndentPt: null,
        styleId: null,
      },
      pageBreakBefore: false,
    },
  ],
  sections: [
    {
      id: 'description',
      title: 'Descrição',
      level: 1,
      order: 1,
      content: sample,
      parentSectionId: null,
    },
  ],
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
  documentType: 'Relatório técnico',
  mainTitle: 'Relatório',
  hierarchy: [],
  sections: [
    {
      name: 'Descrição',
      level: 1,
      order: 1,
      purpose: null,
      required: true,
      repeatable: false,
      children: [],
    },
  ],
  activityPatterns: [],
  fields: [
    {
      name: 'responsavel',
      label: 'responsável',
      type: 'text',
      required: false,
      evidence: [
        {
          source: 'paragraph',
          elementId: 'owner',
          excerpt: 'Responsável: João Silva',
          reason: 'Rótulo e valor explícitos.',
        },
      ],
    },
  ],
  recurringElements: [],
  optionalElements: [],
  requiredElements: ['Descrição'],
}

const profile: WritingStyleProfile = {
  tone: 'técnico',
  formality: 'alta',
  technicality: 'alta',
  objectivity: 'alta',
  averageParagraphWords: 8,
  sentenceComplexity: 'média',
  grammaticalPerson: 'terceira pessoa',
  verbTense: 'pretérito',
  voice: 'passiva',
  firstPersonUsage: 'ausente',
  thirdPersonUsage: 'predominante',
  detailLevel: 'moderado',
  narrativeStyle: 'procedimental',
  evidence: [],
}
const writing: WritingPattern = {
  globalStyle: profile,
  sectionStyles: [
    {
      ...profile,
      sectionName: 'Descrição',
      introductionPatterns: [],
      developmentPatterns: [],
      conclusionPatterns: [],
    },
  ],
  vocabulary: [],
  terminology: [],
  sentencePatterns: [],
  paragraphPatterns: [],
  narrativePatterns: [
    {
      rule: 'Apresentar a ação e o procedimento.',
      justification: 'Ordem observada.',
      evidence: [],
    },
  ],
  forbiddenPatterns: [],
  recommendedPatterns: [],
}

const sectionEvidence = {
  sectionName: 'Descrição',
  excerpt: sample,
  reason: 'A frase registra ação e procedimento.',
}
const fieldEvidence = {
  sectionName: 'Descrição',
  excerpt: 'Responsável: João Silva',
  reason: 'O contexto identifica o papel de responsável.',
}

function validPattern(): SemanticPattern {
  return {
    documentType: 'Relatório técnico',
    sections: [
      {
        sectionName: 'Descrição',
        purpose: 'Registrar o que foi executado e como.',
        expectedInformation: [
          {
            name: 'procedimento executado',
            description: 'Ação e procedimento realizado.',
            informationType: 'procedure',
            required: true,
            evidence: [sectionEvidence],
          },
        ],
        excludedInformation: [],
        informationOrder: ['ação', 'procedimento'],
        relationships: [],
        narrativePattern: 'ação seguida do procedimento',
        detailLevel: 'moderado',
        evidence: [sectionEvidence],
      },
    ],
    activityPatterns: [],
    fields: [
      {
        name: 'responsavel',
        label: 'responsável',
        semanticRole: 'Pessoa responsável pela execução.',
        valueType: 'text',
        required: false,
        evidence: [fieldEvidence],
      },
    ],
    crossSectionRelations: [],
    uncertainties: [],
  }
}

function validUnits() {
  return {
    global: {
      documentPurpose: 'Registrar atividades tecnicas.',
      overallInformationFlow: ['section-001'],
      generalSemanticRules: [],
      fieldRoles: [
        {
          fieldId: 'field-001',
          semanticRole: 'Pessoa responsavel pela execucao.',
          evidenceIds: ['field-001-evidence-1'],
        },
      ],
    },
    section: {
      sectionId: 'section-001',
      purpose: 'Registrar o que foi executado e como.',
      expectedInformation: [
        {
          name: 'procedimento executado',
          description: 'Acao e procedimento realizado.',
          informationType: 'procedure',
          requirement: 'common',
          supportIds: ['section-001-evidence-1'],
        },
      ],
      excludedInformation: [],
      evidenceIds: ['section-001-evidence-1'],
    },
    relations: { relations: [] },
  }
}

describe('SemanticAnalysisService', () => {
  it('identifica função da seção e papel reutilizável dos campos', async () => {
    const units = validUnits()
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.global))
        .mockResolvedValueOnce(JSON.stringify(units.section))
        .mockResolvedValueOnce(JSON.stringify(units.relations)),
    }
    const result = await new SemanticAnalysisService(generator).analyze(
      document,
      structure,
      writing,
    )
    expect(result.sections[0]).toMatchObject({
      sectionName: 'Descrição',
      narrativePattern: 'procedimental',
    })
    expect(result.fields[0]).toMatchObject({
      label: 'responsável',
      semanticRole: 'Pessoa responsavel pela execucao.',
    })
    expect(generator.generateJson).toHaveBeenCalledTimes(2)
  })

  it('envia estrutura, estilo e trechos representativos, não o documento bruto', async () => {
    const input = buildSemanticAnalysisInput(document, structure, writing)
    expect(input.sections[0]).toMatchObject({
      name: 'Descrição',
      writingStyle: { tone: 'técnico' },
    })
    expect(input.fieldCandidates[0]?.evidence[0]?.sectionName).toBe('Descrição')
    const units = validUnits()
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.global))
        .mockResolvedValueOnce(JSON.stringify(units.section))
        .mockResolvedValueOnce(JSON.stringify(units.relations)),
    }
    await new SemanticAnalysisService(generator).analyze(
      document,
      structure,
      writing,
    )
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain(sample)
    expect(prompt).not.toContain(document.text)
  })

  it('consolida ocorrências repetidas no mesmo padrão de atividade', () => {
    const repeatedStructure = structuredClone(structure)
    repeatedStructure.sections.push(
      {
        name: 'Atividade 1',
        level: 1,
        order: 2,
        purpose: null,
        required: true,
        repeatable: true,
        children: [],
      },
      {
        name: 'Atividade 2',
        level: 1,
        order: 3,
        purpose: null,
        required: true,
        repeatable: true,
        children: [],
      },
    )
    repeatedStructure.activityPatterns = [
      {
        namePattern: 'atividade {n}',
        sections: ['descricao', 'resultado'],
        order: 2,
        repeatable: true,
        fields: [],
      },
    ]
    const input = buildSemanticAnalysisInput(
      document,
      repeatedStructure,
      writing,
    )
    expect(input.activityPatterns).toEqual([
      {
        namePattern: 'atividade {n}',
        sections: ['descricao', 'resultado'],
        occurrenceCount: 2,
      },
    ])
  })

  it('rejeita JSON inválido e contrato incompleto', async () => {
    await expect(
      new SemanticAnalysisService({
        generateJson: vi.fn().mockResolvedValue('inválido'),
      }).analyze(document, structure, writing),
    ).rejects.toMatchObject({ code: 'INVALID_SEMANTIC_ANALYSIS' })
    await expect(
      new SemanticAnalysisService({
        generateJson: vi.fn().mockResolvedValue('{}'),
      }).analyze(document, structure, writing),
    ).rejects.toMatchObject({ code: 'INVALID_SEMANTIC_ANALYSIS' })
  })

  it('rejeita seção, campo e evidência inventados', async () => {
    const inventedSection = validPattern()
    inventedSection.sections[0]!.sectionName = 'Inventada'
    await expect(
      new SemanticAnalysisService({
        generateJson: vi
          .fn()
          .mockResolvedValue(JSON.stringify(inventedSection)),
      }).analyze(document, structure, writing),
    ).rejects.toMatchObject({ code: 'INVALID_SEMANTIC_ANALYSIS' })
    const inventedField = validPattern()
    inventedField.fields[0]!.name = 'cliente'
    await expect(
      new SemanticAnalysisService({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(inventedField)),
      }).analyze(document, structure, writing),
    ).rejects.toMatchObject({ code: 'INVALID_SEMANTIC_ANALYSIS' })
    const inventedEvidence = validPattern()
    inventedEvidence.sections[0]!.evidence[0]!.excerpt = 'Fato que não existe.'
    await expect(
      new SemanticAnalysisService({
        generateJson: vi
          .fn()
          .mockResolvedValue(JSON.stringify(inventedEvidence)),
      }).analyze(document, structure, writing),
    ).rejects.toMatchObject({ code: 'INVALID_SEMANTIC_ANALYSIS' })
  })

  it('corrige somente a secao que retornou evidencia ou requisito invalido', async () => {
    const units = validUnits()
    const invalidSection = structuredClone(units.section)
    invalidSection.expectedInformation[0]!.requirement = 'required'
    invalidSection.expectedInformation[0]!.supportIds = ['section-001-evidence-1']
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.global))
        .mockResolvedValueOnce(JSON.stringify(invalidSection))
        .mockResolvedValueOnce(JSON.stringify(units.section))
        .mockResolvedValueOnce(JSON.stringify(units.relations)),
    }
    const attempts: string[] = []
    await new SemanticAnalysisService(generator).analyze(document, structure, writing, {
      onAttempt: (attempt) => attempts.push(`${attempt.scope}:${attempt.attempt}`),
    })
    expect(attempts).toEqual([
      'global:0',
      'section/section-001:0',
      'section/section-001:1',
    ])
  })

  it('rejeita exclusao inventada e corrige somente a secao', async () => {
    const units = validUnits()
    const invalidSection = structuredClone(units.section)
    ;(invalidSection as { excludedInformation: unknown[] }).excludedInformation.push({
      rule: 'Nao mencionar datas.',
      justification: 'Nao ha datas.',
      evidenceIds: ['section-001-evidence-1'],
    })
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.global))
        .mockResolvedValueOnce(JSON.stringify(invalidSection))
        .mockResolvedValueOnce(JSON.stringify(units.section))
        .mockResolvedValueOnce(JSON.stringify(units.relations)),
    }
    await expect(
      new SemanticAnalysisService(generator).analyze(document, structure, writing),
    ).resolves.toMatchObject({ documentType: 'Relatório técnico' })
    expect(generator.generateJson).toHaveBeenCalledTimes(3)
  })

  it('pula relações quando há somente uma seção', async () => {
    const units = validUnits()
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.global))
        .mockResolvedValueOnce(JSON.stringify(units.section)),
    }
    const result = await new SemanticAnalysisService(generator).analyze(
      document,
      structure,
      writing,
    )
    expect(result.crossSectionRelations).toEqual([])
    expect(generator.generateJson).toHaveBeenCalledTimes(2)
  })

  it('esgota retry global sem executar secoes', async () => {
    const generator = { generateJson: vi.fn().mockResolvedValue('{}') }
    await expect(
      new SemanticAnalysisService(generator).analyze(document, structure, writing),
    ).rejects.toMatchObject({
      code: 'INVALID_SEMANTIC_ANALYSIS',
      internalCode: 'INVALID_GLOBAL_SEMANTIC_ANALYSIS',
    })
    expect(generator.generateJson).toHaveBeenCalledTimes(3)
  })

  it('retoma subcheckpoints e nao repete o global valido', async () => {
    const units = validUnits()
    const repository = new InMemoryPipelineCheckpointRepository()
    const checkpoints = {
      coordinator: new PipelineCheckpointCoordinator(
        repository,
        createPipelineCheckpointCompatibility('qwen3:8b'),
      ),
      documentHash: 'fixture-hash',
    }
    const first = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.global))
        .mockResolvedValue('{}'),
    }
    await expect(
      new SemanticAnalysisService(first).analyze(document, structure, writing, {
        checkpoints,
      }),
    ).rejects.toMatchObject({ internalCode: 'INVALID_SECTION_SEMANTIC_ANALYSIS' })
    const second = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(JSON.stringify(units.section))
        .mockResolvedValueOnce(JSON.stringify(units.relations)),
    }
    const reused: string[] = []
    await new SemanticAnalysisService(second).analyze(document, structure, writing, {
      checkpoints,
      onReuse: (scope) => reused.push(scope),
    })
    expect(reused).toEqual(['global'])
    expect(second.generateJson).toHaveBeenCalledTimes(1)
  })
})
