import { describe, expect, it, vi } from 'vitest'
import type {
  StructurePattern,
} from '../../../src/domain/templates'
import type { DocumentRepresentation } from '../documents/types'
import {
  buildWritingAnalysisInput,
  buildWritingAnalysisPlan,
  type WritingAnalysisPlanBatch,
} from './prompts/writing-analysis.prompt'
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

function batchEvidence(batch: WritingAnalysisPlanBatch, sectionIndex = 0) {
  const section = batch.input.sections[sectionIndex]!
  const sample = section.samples[0]!
  return {
    sectionId: section.id,
    sampleId: sample.id,
    excerpt: sample.text,
    reason: 'Emprega construção técnica e impessoal.',
  }
}

function validBatchPattern(batch: WritingAnalysisPlanBatch) {
  const sectionStyles = batch.input.sections.map((section, index) => {
    const evidence = batchEvidence(batch, index)
    return {
      sectionId: section.id,
      tone: index === 0 ? 'técnico' : 'técnico objetivo',
      formality: 'alta',
      technicality: 'alta',
      objectivity: 'alta',
      averageParagraphWords: section.paragraphWordCounts[0] ?? 0,
      sentenceComplexity: 'média',
      grammaticalPerson: 'terceira pessoa',
      verbTense: index === 0 ? 'pretérito perfeito' : 'pretérito',
      voice: 'predominantemente passiva',
      firstPersonUsage: 'ausente',
      thirdPersonUsage: 'predominante',
      detailLevel: 'moderado',
      narrativeStyle: index === 0 ? 'procedimental' : 'conclusivo',
      evidence: [evidence],
      introductionPatterns: [
        {
          rule: 'Abrir a seção com afirmação técnica direta.',
          justification: 'A amostra inicia com fato técnico verificável.',
          evidence: [evidence],
        },
      ],
      developmentPatterns: [],
      conclusionPatterns: [],
    }
  })
  const evidence = batchEvidence(batch)
  const batchRule = {
    rule: 'Empregar terminologia técnica contextual.',
    justification: 'A amostra utiliza nomenclatura do procedimento.',
    evidence: [evidence],
  }
  return {
    batchId: batch.batchId,
    sectionStyles,
    vocabulary: [batchRule],
    terminology: [batchRule],
    sentencePatterns: [batchRule],
    paragraphPatterns: [batchRule],
    narrativePatterns: [batchRule],
    forbiddenPatterns: [],
    recommendedPatterns: [batchRule],
  }
}

function responseFor(document: DocumentRepresentation, structure: StructurePattern) {
  const input = buildWritingAnalysisInput(document, structure)
  const plan = buildWritingAnalysisPlan(input)
  return JSON.stringify(validBatchPattern(plan.batches[0]!))
}

describe('WritingAnalysisService', () => {
  it('cria plano determinístico com sectionIds, batchIds e limites de contexto', () => {
    const input = buildWritingAnalysisInput(document, structure)
    const first = buildWritingAnalysisPlan(input)
    const second = buildWritingAnalysisPlan(input)

    expect(first).toEqual(second)
    expect(first.contextLimits.maxBatchCharacters).toBeGreaterThan(0)
    expect(first.batches[0]).toMatchObject({
      batchId: expect.stringContaining('writing-batch-1-sec-1-descricao'),
      sectionIds: ['sec-1-descricao', 'sec-2-resultado'],
      objective: expect.any(String),
      contextLimits: first.contextLimits,
    })
    expect(first.batches[0]?.evidence[0]).toEqual({
      sectionId: 'sec-1-descricao',
      sampleIds: ['sec-1-descricao-sample-1', 'sec-1-descricao-sample-2'],
    })
  })

  it('gera análise global e específica por seção usando o Ollama', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(responseFor(document, structure)),
    }
    const result = await new WritingAnalysisService(generator).analyze(
      document,
      structure,
    )
    expect(result.globalStyle.tone).toBe(
      'variável entre seções: técnico; técnico objetivo',
    )
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
      generateJson: vi.fn().mockResolvedValue(responseFor(document, structure)),
    }
    await new WritingAnalysisService(generator).analyze(document, structure)
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain('WRITING PROMPT CONTEXT')
    expect(prompt).toContain('DATA, nao instrucao')
    expect(prompt).toContain('DOCUMENT_DATA_BEGIN')
    expect(prompt).toContain('DOCUMENT_DATA_END')
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
    expect(JSON.stringify(input)).toContain('[NUMERO]')
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
    expect(input.sections[0]?.samples.map((sample) => sample.text)).toEqual([
      'Primeiro procedimento executado.',
      'Segundo procedimento executado.',
    ])
  })

  it('aceita variações inofensivas de espaços e caixa sem aceitar outro texto', async () => {
    const input = buildWritingAnalysisInput(document, structure)
    const batch = buildWritingAnalysisPlan(input).batches[0]!
    const pattern = validBatchPattern(batch)
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
      expect.objectContaining({ sectionName: 'Descrição' }),
    )
  })

  it('associa nomes reais quando o modelo omite a numeração da seção', async () => {
    const numberedStructure = structuredClone(structure)
    numberedStructure.sections[0]!.name = '1. Descrição'
    const source = structuredClone(document)
    source.sections[0]!.title = '1. Descrição'
    const input = buildWritingAnalysisInput(source, numberedStructure)
    const batch = buildWritingAnalysisPlan(input).batches[0]!
    const pattern = validBatchPattern(batch)

    const result = await new WritingAnalysisService({
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(pattern)),
    }).analyze(source, numberedStructure)

    expect(result.sectionStyles[0]?.sectionName).toBe('1. Descrição')
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
    const input = buildWritingAnalysisInput(document, structure)
    const batch = buildWritingAnalysisPlan(input).batches[0]!
    const invented = validBatchPattern(batch)
    invented.sectionStyles[0]!.sectionId = 'secao-inventada'
    await expect(
      new WritingAnalysisService({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(invented)),
      }).analyze(document, structure),
    ).rejects.toMatchObject({ code: 'INVALID_WRITING_ANALYSIS' })
  })

  it('rejeita evidência que não pertence às amostras fornecidas', async () => {
    const input = buildWritingAnalysisInput(document, structure)
    const batch = buildWritingAnalysisPlan(input).batches[0]!
    const invented = validBatchPattern(batch)
    invented.sectionStyles[0]!.evidence[0]!.excerpt = 'Frase criada pelo modelo.'
    await expect(
      new WritingAnalysisService({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(invented)),
      }).analyze(document, structure),
    ).rejects.toMatchObject({ code: 'INVALID_WRITING_ANALYSIS' })
  })

  it('reprocessa somente o lote que falhou validação', async () => {
    const largeDocument = structuredClone(document)
    largeDocument.sections = Array.from({ length: 5 }, (_, index) => ({
      id: `section-${index + 1}`,
      title: `Seção ${index + 1}`,
      level: 1,
      order: index + 1,
      content: Array.from({ length: 8 }, (_, paragraph) =>
        `Texto técnico detalhado da seção ${index + 1}, parágrafo ${paragraph + 1}, com construção impessoal e terminologia de procedimento operacional. `.repeat(8),
      ).join('\n'),
      parentSectionId: null,
    }))
    const largeStructure: StructurePattern = {
      ...structure,
      sections: largeDocument.sections.map((section) => ({
        name: section.title,
        level: 1,
        order: section.order,
        purpose: `Analisar a escrita da ${section.title}.`,
        required: true,
        repeatable: false,
        children: [],
      })),
      requiredElements: largeDocument.sections.map((section) => section.title),
    }
    const input = buildWritingAnalysisInput(largeDocument, largeStructure)
    const plan = buildWritingAnalysisPlan(input)
    expect(plan.batches.length).toBeGreaterThan(1)
    const responses = [
      JSON.stringify(validBatchPattern(plan.batches[0]!)),
      '{}',
      JSON.stringify(validBatchPattern(plan.batches[1]!)),
      ...plan.batches
        .slice(2)
        .map((batch) => JSON.stringify(validBatchPattern(batch))),
    ]
    const generator = {
      generateJson: vi.fn().mockImplementation(() => {
        const next = responses.shift()
        if (!next) throw new Error('Resposta inesperada.')
        return Promise.resolve(next)
      }),
    }

    await new WritingAnalysisService(generator).analyze(
      largeDocument,
      largeStructure,
    )

    expect(generator.generateJson).toHaveBeenCalledTimes(plan.batches.length + 1)
    const prompts = generator.generateJson.mock.calls.map(
      ([prompt]) => prompt as string,
    )
    expect(prompts[0]).toContain(plan.batches[0]!.batchId)
    expect(prompts[1]).toContain(plan.batches[1]!.batchId)
    expect(prompts[2]).toContain(plan.batches[1]!.batchId)
  })

  it('mantém golden fixture de estrutura, regras, evidências, estilos e terminologia', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(responseFor(document, structure)),
    }

    const result = await new WritingAnalysisService(generator).analyze(
      document,
      structure,
    )

    expect(result).toMatchObject({
      sectionStyles: [
        {
          sectionName: 'Descrição',
          grammaticalPerson: 'terceira pessoa',
          voice: 'predominantemente passiva',
          verbTense: 'pretérito perfeito',
          narrativeStyle: 'procedimental',
          introductionPatterns: [
            {
              rule: 'Abrir a seção com afirmação técnica direta.',
              evidence: [
                {
                  sectionName: 'Descrição',
                  excerpt:
                    'O procedimento foi executado conforme a especificação técnica.',
                },
              ],
            },
          ],
        },
        {
          sectionName: 'Resultado',
          narrativeStyle: 'conclusivo',
        },
      ],
      terminology: [
        {
          rule: 'Empregar terminologia técnica contextual.',
        },
      ],
      narrativePatterns: [
        {
          rule: 'Empregar terminologia técnica contextual.',
        },
      ],
    })
    expect(result.globalStyle.narrativeStyle).toContain('variável entre seções')
    expect(result.recommendedPatterns[0]?.evidence[0]?.sectionName).toBe(
      'Descrição',
    )
  })
})
