import { renderToStaticMarkup } from 'react-dom/server'
import { describe, expect, it } from 'vitest'
import type { ReportTemplate } from '../../domain/templates/report-template'
import { TemplateReview } from './TemplateReview'

function snapshot(): ReportTemplate {
  return {
    version: 2,
    metadata: {
      id: 'template',
      name: 'Modelo rico',
      description: 'Descrição',
      documentType: 'Relatório técnico',
      status: 'draft',
      createdAt: '2026-08-23T00:00:00.000Z',
      updatedAt: '2026-08-23T00:00:00.000Z',
    },
    structurePattern: {
      documentType: 'Relatório técnico',
      mainTitle: 'Relatório',
      hierarchy: [
        {
          name: 'Atividade',
          level: 1,
          order: 1,
          purpose: 'Registrar atividade',
          required: true,
          repeatable: true,
          children: [
            {
              name: 'Execução',
              level: 2,
              order: 2,
              purpose: null,
              required: true,
              repeatable: false,
              children: [],
            },
          ],
        },
      ],
      sections: [],
      activityPatterns: [],
      fields: [],
      recurringElements: [],
      optionalElements: ['Observações'],
      requiredElements: ['Execução'],
    },
    fields: [
      {
        name: 'responsavel',
        label: 'Responsável',
        type: 'text',
        required: true,
        evidence: [
          {
            source: 'paragraph',
            elementId: 'paragraph-1',
            excerpt: 'Responsável: valor variável',
            reason: 'Rótulo identificado.',
          },
        ],
      },
    ],
    activityPatterns: [
      {
        namePattern: 'Atividade {n}',
        sections: ['Execução'],
        order: 1,
        repeatable: true,
        fields: [],
      },
    ],
    writingPattern: {
      globalStyle: {
        tone: 'técnico',
        grammaticalPerson: 'terceira pessoa',
        verbTense: 'pretérito',
        voice: 'passiva',
        formality: 'alta',
        technicality: 'alta',
        objectivity: 'alta',
        averageParagraphWords: 20,
        sentenceComplexity: 'média',
        firstPersonUsage: 'ausente',
        thirdPersonUsage: 'frequente',
        detailLevel: 'detalhado',
        narrativeStyle: 'cronológico',
        evidence: [],
      },
      sectionStyles: [],
      vocabulary: [],
      terminology: [],
      sentencePatterns: [],
      paragraphPatterns: [],
      narrativePatterns: [],
      forbiddenPatterns: [],
      recommendedPatterns: [
        {
          rule: 'Descrever em ordem cronológica.',
          justification: 'Padrão recorrente.',
          evidence: [
            {
              sectionName: 'Execução',
              excerpt: 'Foi executado o procedimento.',
              reason: 'Ordem observada.',
            },
          ],
        },
      ],
    },
    semanticPattern: {
      documentType: 'Relatório técnico',
      sections: [
        {
          sectionName: 'Execução',
          purpose: 'Registrar procedimentos.',
          expectedInformation: [
            {
              name: 'procedimento',
              description: 'Procedimento executado',
              informationType: 'procedure',
              required: true,
              evidence: [],
            },
          ],
          excludedInformation: [
            {
              rule: 'Não presumir resultados.',
              justification: 'Ausência no documento.',
              evidence: [],
            },
          ],
          informationOrder: ['procedimento'],
          relationships: [
            {
              targetSection: 'Resultado',
              relationship: 'A execução antecede o resultado.',
              evidence: [
                {
                  sectionName: 'Execução',
                  excerpt: 'Foi executado.',
                  reason: 'Sequência observada.',
                },
              ],
            },
          ],
          narrativePattern: 'ação → resultado',
          detailLevel: 'detalhado',
          evidence: [],
        },
      ],
      activityPatterns: [],
      fields: [],
      crossSectionRelations: [],
      uncertainties: [],
    },
    formattingPattern: {
      documentStyle: {
        predominantFont: 'Arial',
        predominantFontSizePt: 11,
        sectionFonts: [],
        pageWidthPt: 595,
        pageHeightPt: 842,
        orientation: 'portrait',
        margins: { topPt: 72, rightPt: 60, bottomPt: 72, leftPt: 60 },
        hasPageNumbering: true,
        pageBreakCount: 0,
        pageBreakBeforeSections: [],
      },
      headingStyles: [
        {
          level: 1,
          sectionNames: ['Execução'],
          sourceStyleId: 'Heading1',
          formatting: {
            fontFamily: 'Arial',
            fontSizePt: 14,
            bold: true,
            italic: false,
            underline: false,
            alignment: 'left',
            lineSpacing: 1,
            spaceBeforePt: 0,
            spaceAfterPt: 6,
            indentLeftPt: 0,
            indentRightPt: 0,
            firstLineIndentPt: 0,
            styleId: 'Heading1',
          },
          evidence: { elementIds: ['p1'], occurrences: 1 },
        },
      ],
      paragraphStyles: [],
      listStyles: [],
      tableStyles: [],
      figureStyles: [],
      captionStyles: [],
      headerStyles: [],
      footerStyles: [],
      sourceStyleIds: ['Heading1'],
    },
    requirements: {
      requiredElements: ['Execução'],
      optionalElements: ['Observações'],
      repeatableElements: ['Atividade'],
    },
  }
}

describe('TemplateReview', () => {
  it('renderiza estrutura, campos, escrita, semântica e formatação ricas', () => {
    const value = snapshot()
    const before = structuredClone(value)
    const html = renderToStaticMarkup(<TemplateReview template={value} />)

    expect(html).toContain('Estrutura')
    expect(html).toContain('Execução')
    expect(html).toContain('paragraph-1')
    expect(html).toContain('Padrão recorrente.')
    expect(html).toContain('Resultado')
    expect(html).toContain('Arial')
    expect(html).toContain('topPt')
    expect(value).toEqual(before)
  })

  it('mantém regras, relações e evidências como objetos, não string[]', () => {
    const value = snapshot()
    const writingRules = value.writingPattern.recommendedPatterns
    const relationships = value.semanticPattern.sections[0]?.relationships
    expect(typeof (writingRules as unknown[])[0]).toBe('object')
    expect(typeof (relationships as unknown[])[0]).toBe('object')
    expect(typeof value.fields[0]?.evidence).toBe('object')
  })
})
