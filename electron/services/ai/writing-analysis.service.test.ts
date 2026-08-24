import { describe, expect, it, vi } from 'vitest'
import type {
  StructurePattern,
  WritingPattern,
  WritingStyleProfile,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import { buildWritingAnalysisInput } from './prompts/writing-analysis.prompt'
import { WritingAnalysisService } from './writing-analysis.service'

const document: DocumentRepresentation = {
  fileName: 'modelo.docx',
  fileType: 'docx',
  text: 'CONTEÚDO BRUTO COMPLETO QUE NÃO PODE SER ENVIADO',
  metadata: {
    fileSize: 1000,
    extractedAt: '2026-08-21T00:00:00.000Z',
    title: 'Relatório',
    author: null,
    createdAt: null,
    modifiedAt: null,
  },
  elements: [],
  paragraphs: [],
  sections: [
    {
      id: 'description',
      title: 'Descrição',
      level: 1,
      order: 1,
      content:
        'O procedimento foi executado conforme a especificação técnica.\nA equipe registrou cada etapa da intervenção.',
      parentSectionId: null,
    },
    {
      id: 'result',
      title: 'Resultado',
      level: 1,
      order: 2,
      content: 'Os testes demonstraram funcionamento normal.',
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
    widthPt: 612,
    heightPt: 792,
    orientation: 'portrait',
    margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
    pageBreakCount: 0,
    hasPageNumbering: true,
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
      purpose: 'Descrever o procedimento.',
      required: true,
      repeatable: false,
      children: [],
    },
    {
      name: 'Resultado',
      level: 1,
      order: 2,
      purpose: 'Registrar resultados.',
      required: true,
      repeatable: false,
      children: [],
    },
  ],
  activityPatterns: [],
  fields: [],
  recurringElements: [],
  optionalElements: [],
  requiredElements: ['Descrição', 'Resultado'],
}

const evidence = {
  sectionName: 'Descrição',
  excerpt: 'O procedimento foi executado conforme a especificação técnica.',
  reason: 'Emprega construção técnica e impessoal.',
}
const resultEvidence = {
  sectionName: 'Resultado',
  excerpt: 'Os testes demonstraram funcionamento normal.',
  reason: 'Apresenta o resultado de forma direta.',
}
const profile: WritingStyleProfile = {
  tone: 'técnico',
  formality: 'alta',
  technicality: 'alta',
  objectivity: 'alta',
  averageParagraphWords: 8,
  sentenceComplexity: 'média',
  grammaticalPerson: 'terceira pessoa',
  verbTense: 'pretérito perfeito',
  voice: 'predominantemente passiva',
  firstPersonUsage: 'ausente',
  thirdPersonUsage: 'predominante',
  detailLevel: 'moderado',
  narrativeStyle: 'procedimental',
  evidence: [evidence],
}
const rule = {
  rule: 'Empregar terminologia técnica contextual.',
  justification: 'A amostra utiliza nomenclatura do procedimento.',
  evidence: [evidence],
}

function validPattern(): WritingPattern {
  return {
    globalStyle: profile,
    sectionStyles: [
      {
        ...profile,
        sectionName: 'Descrição',
        introductionPatterns: [rule],
        developmentPatterns: [],
        conclusionPatterns: [],
      },
      {
        ...profile,
        sectionName: 'Resultado',
        evidence: [resultEvidence],
        introductionPatterns: [],
        developmentPatterns: [],
        conclusionPatterns: [],
      },
    ],
    vocabulary: [rule],
    terminology: [rule],
    sentencePatterns: [rule],
    paragraphPatterns: [rule],
    narrativePatterns: [rule],
    forbiddenPatterns: [],
    recommendedPatterns: [rule],
  }
}

describe('WritingAnalysisService', () => {
  it('gera análise global e específica por seção usando o Ollama', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(validPattern())),
    }
    const result = await new WritingAnalysisService(generator).analyze(
      document,
      structure,
    )
    expect(result.globalStyle.tone).toBe('técnico')
    expect(result.sectionStyles[0]).toMatchObject({
      sectionName: 'Descrição',
      narrativeStyle: 'procedimental',
    })
    expect(generator.generateJson).toHaveBeenCalledOnce()
    expect(generator.generateJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
    )
  })

  it('envia somente amostras representativas e dados estruturais', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(validPattern())),
    }
    await new WritingAnalysisService(generator).analyze(document, structure)
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain('AMOSTRAS REPRESENTATIVAS')
    expect(prompt).toContain('O procedimento foi executado')
    expect(prompt).not.toContain(document.text)
  })

  it('limita as amostras a início, meio e fim e remove dados sensíveis comuns', () => {
    const source = structuredClone(document)
    source.sections[0]!.content =
      'Primeiro em 21/08/2026.\nSegundo.\nContato pessoa@empresa.com.\nQuarto.\nNúmero 123456789.'
    const input = buildWritingAnalysisInput(source, structure)
    expect(input.sections[0]?.samples).toHaveLength(3)
    expect(JSON.stringify(input)).toContain('[DATA]')
    expect(JSON.stringify(input)).toContain('[NÚMERO]')
    expect(JSON.stringify(input)).not.toContain('pessoa@empresa.com')
  })

  it('consolida ocorrências repetidas da mesma seção', () => {
    const source = structuredClone(document)
    source.sections = [
      {
        ...source.sections[0]!,
        title: 'Atividade 1',
        content: 'Primeiro procedimento executado.',
      },
      {
        ...source.sections[0]!,
        id: 'activity-2',
        title: 'Atividade 2',
        content: 'Segundo procedimento executado.',
      },
    ]
    const repeatedStructure: StructurePattern = {
      ...structure,
      sections: [
        {
          ...structure.sections[0]!,
          name: 'Atividade',
          repeatable: true,
        },
      ],
    }
    const input = buildWritingAnalysisInput(source, repeatedStructure)
    expect(input.sections).toHaveLength(1)
    expect(input.sections[0]?.samples).toEqual([
      'Primeiro procedimento executado.',
      'Segundo procedimento executado.',
    ])
  })

  it('aceita variações inofensivas de espaços e caixa sem aceitar outro texto', async () => {
    const pattern = validPattern()
    pattern.sectionStyles[0]!.sectionName = 'descrição'
    pattern.sectionStyles[0]!.evidence[0]!.sectionName = 'descrição'
    pattern.sectionStyles[0]!.evidence[0]!.excerpt =
      'O procedimento foi executado   conforme a especificação técnica.'
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(pattern)),
    }
    const result = await new WritingAnalysisService(generator).analyze(
      document,
      structure,
    )
    expect(result.sectionStyles).toContainEqual(
      expect.objectContaining({ sectionName: 'descrição' }),
    )
  })

  it('associa nomes reais quando o modelo omite a numeração da seção', async () => {
    const numberedStructure = structuredClone(structure)
    numberedStructure.sections[0]!.name = '1. Descrição'
    const source = structuredClone(document)
    source.sections[0]!.title = '1. Descrição'
    const pattern = validPattern()

    const result = await new WritingAnalysisService({
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(pattern)),
    }).analyze(source, numberedStructure)

    expect(result.sectionStyles[0]?.sectionName).toBe('Descrição')
  })

  it('rejeita JSON inválido, contrato incompleto e seção inventada', async () => {
    await expect(
      new WritingAnalysisService({
        generateJson: vi.fn().mockResolvedValue('texto'),
      }).analyze(document, structure),
    ).rejects.toMatchObject({ code: 'INVALID_WRITING_ANALYSIS' })
    await expect(
      new WritingAnalysisService({
        generateJson: vi.fn().mockResolvedValue('{}'),
      }).analyze(document, structure),
    ).rejects.toMatchObject({ code: 'INVALID_WRITING_ANALYSIS' })
    const invented = validPattern()
    invented.sectionStyles[0]!.sectionName = 'Seção inventada'
    await expect(
      new WritingAnalysisService({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(invented)),
      }).analyze(document, structure),
    ).rejects.toMatchObject({ code: 'INVALID_WRITING_ANALYSIS' })
  })

  it('rejeita evidência que não pertence às amostras fornecidas', async () => {
    const invented = validPattern()
    invented.globalStyle.evidence[0]!.excerpt = 'Frase criada pelo modelo.'
    await expect(
      new WritingAnalysisService({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(invented)),
      }).analyze(document, structure),
    ).rejects.toMatchObject({ code: 'INVALID_WRITING_ANALYSIS' })
  })
})
