import { describe, expect, it, vi } from 'vitest'
import type {
  DocumentRepresentation,
  ExtractedParagraph,
  ExtractedSection,
} from './types'
import { StructureAnalysisService } from './structure-analysis.service'

const formatting: ExtractedParagraph['formatting'] = {
  fontFamily: 'Arial',
  fontSizePt: 11,
  bold: false,
  italic: false,
  underline: false,
  alignment: 'left',
  lineSpacing: 1.15,
  spaceBeforePt: 0,
  spaceAfterPt: 6,
  indentLeftPt: 0,
  indentRightPt: 0,
  firstLineIndentPt: 0,
  styleId: 'Normal',
}

function documentFixture(
  options: {
    title?: string | null
    sections?: ExtractedSection[]
    paragraphs?: Array<{ id: string; text: string; sectionId: string | null }>
  } = {},
): DocumentRepresentation {
  const sections = options.sections ?? [
    {
      id: 'objective',
      title: 'Objetivo',
      level: 1,
      order: 1,
      content: 'Registrar serviços.',
      parentSectionId: null,
    },
    {
      id: 'results',
      title: 'Resultados',
      level: 1,
      order: 2,
      content: 'Resultados obtidos.',
      parentSectionId: null,
    },
  ]
  const paragraphs = (options.paragraphs ?? []).map(
    (paragraph, index): ExtractedParagraph => ({
      ...paragraph,
      order: index + 1,
      style: 'paragraph',
      headingLevel: null,
      numbering: null,
      formatting,
      pageBreakBefore: false,
    }),
  )
  return {
    fileName: 'modelo.docx',
    fileType: 'docx',
    text: paragraphs.map((item) => item.text).join('\n'),
    metadata: {
      fileSize: 1000,
      extractedAt: '2026-08-21T00:00:00.000Z',
      title: options.title === undefined ? 'Relatório Técnico' : options.title,
      author: null,
      createdAt: null,
      modifiedAt: null,
    },
    elements: [],
    paragraphs,
    sections,
    headings: sections.map((section) => ({
      id: `heading-${section.id}`,
      paragraphId: `p-${section.id}`,
      title: section.title,
      level: section.level,
      order: section.order,
      sectionId: section.id,
    })),
    lists: [],
    tables: [],
    figures: [],
    headers: [
      {
        id: 'header',
        type: 'header',
        variant: 'default',
        text: 'SIEAR',
        paragraphs: ['SIEAR'],
      },
    ],
    footers: [
      {
        id: 'footer',
        type: 'footer',
        variant: 'default',
        text: 'Página PAGE',
        paragraphs: ['Página PAGE'],
      },
    ],
    pageInformation: {
      widthPt: 612,
      heightPt: 792,
      orientation: 'portrait',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
      pageBreakCount: 0,
      hasPageNumbering: true,
    },
    formatting: { defaultParagraph: formatting },
    styles: [],
  }
}

describe('StructureAnalysisService', () => {
  it('identifica hierarquia, ordem, título e finalidades sem chamar Ollama', async () => {
    const generator = { generateJson: vi.fn() }
    const result = await new StructureAnalysisService(generator).analyze(
      documentFixture(),
    )
    expect(result.mainTitle).toBe('Relatório Técnico')
    expect(result.sections.map((section) => section.name)).toEqual([
      'Objetivo',
      'Resultados',
    ])
    expect(result.sections.map((section) => section.purpose)).toEqual([
      'Apresentar o objetivo do documento ou da atividade.',
      'Registrar os resultados observados.',
    ])
    expect(generator.generateJson).not.toHaveBeenCalled()
  })

  it('consolida ocorrências de atividades em um único padrão repetível', async () => {
    const sections: ExtractedSection[] = [
      {
        id: 'a1',
        title: 'Atividade 1',
        level: 1,
        order: 1,
        content: '',
        parentSectionId: null,
      },
      {
        id: 'd1',
        title: 'Descrição',
        level: 2,
        order: 2,
        content: '',
        parentSectionId: 'a1',
      },
      {
        id: 'j1',
        title: 'Justificativa',
        level: 2,
        order: 3,
        content: '',
        parentSectionId: 'a1',
      },
      {
        id: 'r1',
        title: 'Resultado',
        level: 2,
        order: 4,
        content: '',
        parentSectionId: 'a1',
      },
      {
        id: 'a2',
        title: 'Atividade 2',
        level: 1,
        order: 5,
        content: '',
        parentSectionId: null,
      },
      {
        id: 'd2',
        title: 'Descrição',
        level: 2,
        order: 6,
        content: '',
        parentSectionId: 'a2',
      },
      {
        id: 'j2',
        title: 'Justificativa',
        level: 2,
        order: 7,
        content: '',
        parentSectionId: 'a2',
      },
      {
        id: 'r2',
        title: 'Resultado',
        level: 2,
        order: 8,
        content: '',
        parentSectionId: 'a2',
      },
    ]
    const result = await new StructureAnalysisService().analyze(
      documentFixture({
        sections,
        paragraphs: [
          { id: 'owner-1', text: 'Responsável: Ana', sectionId: 'd1' },
          { id: 'owner-2', text: 'Responsável: Bruno', sectionId: 'd2' },
        ],
      }),
    )
    expect(result.activityPatterns).toEqual([
      expect.objectContaining({
        namePattern: 'atividade {n}',
        sections: ['descricao', 'justificativa', 'resultado'],
        repeatable: true,
        fields: [expect.objectContaining({ label: 'responsável' })],
      }),
    ])
    expect(result.recurringElements).toContainEqual(
      expect.objectContaining({
        type: 'section',
        name: 'descricao',
        occurrences: 2,
      }),
    )
    expect(result.hierarchy).toHaveLength(2)
    expect(result.hierarchy[0]?.children).toHaveLength(3)
  })

  it('identifica apenas campos conhecidos e registra evidências', async () => {
    const result = await new StructureAnalysisService().analyze(
      documentFixture({
        paragraphs: [
          {
            id: 'p1',
            text: 'Responsável: Maria Silva',
            sectionId: 'objective',
          },
          { id: 'p2', text: 'Data: 21/08/2026', sectionId: 'objective' },
          {
            id: 'p3',
            text: 'Comentário casual: não é um campo reconhecido',
            sectionId: 'objective',
          },
        ],
      }),
    )
    expect(result.fields.map((field) => field.label)).toEqual([
      'responsável',
      'data',
    ])
    expect(result.fields[0]?.evidence[0]).toMatchObject({
      source: 'paragraph',
      elementId: 'p1',
      excerpt: 'Responsável: Maria Silva',
    })
    expect(result.fields[1]?.type).toBe('date')
  })

  it('usa fallback semântico somente para estrutura ambígua e envia um resumo', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(
        JSON.stringify({
          documentType: 'Registro operacional',
          sectionPurposes: [
            {
              name: 'Escopo XPTO',
              purpose: 'Delimitar o escopo operacional.',
            },
          ],
        }),
      ),
    }
    const document = documentFixture({
      title: null,
      sections: [
        {
          id: 'x',
          title: 'Escopo XPTO',
          level: 1,
          order: 1,
          content: 'Conteúdo.',
          parentSectionId: null,
        },
      ],
    })
    document.text = 'CONTEÚDO INTEGRAL QUE NÃO DEVE SER ENVIADO AO OLLAMA'
    const result = await new StructureAnalysisService(generator).analyze(
      document,
    )
    expect(result.documentType).toBe('Registro operacional')
    expect(result.sections[0]?.purpose).toBe('Delimitar o escopo operacional.')
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain('RESUMO ESTRUTURAL')
    expect(prompt).not.toContain(document.text)
  })

  it('associa semanticamente nomes reais com diferenças de caixa, acento e numeração', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(
        JSON.stringify({
          documentType: 'Relatório operacional',
          sectionPurposes: [
            {
              name: '1. ESCOPO AGIL',
              purpose: 'Contextualizar a operação.',
            },
          ],
        }),
      ),
    }
    const result = await new StructureAnalysisService(generator).analyze(
      documentFixture({
        title: null,
        sections: [
          {
            id: 'scope',
            title: 'Escopo Ágil',
            level: 1,
            order: 1,
            content: 'Contexto específico.',
            parentSectionId: null,
          },
        ],
      }),
    )

    expect(result.sections[0]?.purpose).toBe('Contextualizar a operação.')
  })

  it('rejeita JSON inválido e referências a seções inexistentes no fallback', async () => {
    const ambiguous = documentFixture({
      title: null,
      sections: [
        {
          id: 'x',
          title: 'Bloco X',
          level: 1,
          order: 1,
          content: '',
          parentSectionId: null,
        },
      ],
    })
    await expect(
      new StructureAnalysisService({
        generateJson: vi.fn().mockResolvedValue('inválido'),
      }).analyze(ambiguous),
    ).rejects.toMatchObject({ code: 'INVALID_STRUCTURE_ANALYSIS' })
    await expect(
      new StructureAnalysisService({
        generateJson: vi.fn().mockResolvedValue(
          JSON.stringify({
            documentType: null,
            sectionPurposes: [{ name: 'Inventada', purpose: 'Algo' }],
          }),
        ),
      }).analyze(ambiguous),
    ).rejects.toMatchObject({ code: 'INVALID_STRUCTURE_ANALYSIS' })
  })
})
