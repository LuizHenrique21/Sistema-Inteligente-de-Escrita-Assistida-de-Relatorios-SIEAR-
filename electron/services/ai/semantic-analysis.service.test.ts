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

describe('SemanticAnalysisService', () => {
  it('identifica função da seção e papel reutilizável dos campos', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(validPattern())),
    }
    const result = await new SemanticAnalysisService(generator).analyze(
      document,
      structure,
      writing,
    )
    expect(result.sections[0]).toMatchObject({
      sectionName: 'Descrição',
      narrativePattern: 'ação seguida do procedimento',
    })
    expect(result.fields[0]).toMatchObject({
      label: 'responsável',
      semanticRole: 'Pessoa responsável pela execução.',
    })
    expect(generator.generateJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
    )
  })

  it('envia estrutura, estilo e trechos representativos, não o documento bruto', async () => {
    const input = buildSemanticAnalysisInput(document, structure, writing)
    expect(input.sections[0]).toMatchObject({
      name: 'Descrição',
      writingStyle: { tone: 'técnico' },
    })
    expect(input.fieldCandidates[0]?.evidence[0]?.sectionName).toBe('Descrição')
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(validPattern())),
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
})
