import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../src/domain/templates/report-template'

export function createRichReportTemplate(id = 'template-1'): ReportTemplate {
  const fieldEvidence = {
    source: 'paragraph' as const,
    elementId: 'paragraph-1',
    excerpt: 'Responsável: valor variável',
    reason: 'Rótulo recorrente identificado.',
  }
  const field = {
    name: 'responsavel',
    label: 'Responsável',
    type: 'text' as const,
    required: true,
    evidence: [fieldEvidence],
  }
  const writingEvidence = {
    sectionName: 'Execução',
    excerpt: 'Foi realizada a substituição do componente.',
    reason: 'Trecho técnico recorrente.',
  }
  const style = {
    tone: 'técnico',
    formality: 'alta',
    technicality: 'alta',
    objectivity: 'alta',
    averageParagraphWords: 24,
    sentenceComplexity: 'média',
    grammaticalPerson: 'terceira pessoa',
    verbTense: 'pretérito',
    voice: 'passiva',
    firstPersonUsage: 'ausente',
    thirdPersonUsage: 'predominante',
    detailLevel: 'detalhado',
    narrativeStyle: 'procedimental',
    evidence: [writingEvidence],
  }
  const writingRule = {
    rule: 'Descrever as ações em ordem cronológica.',
    justification: 'Sequência recorrente nas atividades.',
    evidence: [writingEvidence],
  }
  const semanticEvidence = {
    sectionName: 'Execução',
    excerpt: 'Foi realizada a substituição do componente.',
    reason: 'O trecho contém ação e procedimento.',
  }
  const section = {
    name: 'Execução',
    level: 2,
    order: 2,
    purpose: 'Registrar o procedimento.',
    required: true,
    repeatable: false,
    children: [],
  }
  const paragraphFormatting = {
    fontFamily: 'Arial',
    fontSizePt: 11,
    bold: false,
    italic: false,
    underline: false,
    alignment: 'justify',
    lineSpacing: 1.15,
    spaceBeforePt: 0,
    spaceAfterPt: 6,
    indentLeftPt: 0,
    indentRightPt: 0,
    firstLineIndentPt: 18,
    styleId: 'Normal',
  }

  return {
    version: REPORT_TEMPLATE_VERSION,
    metadata: {
      id,
      name: 'Modelo técnico',
      description: 'Padrão rico aprendido de um DOCX.',
      documentType: 'Relatório técnico',
      status: 'draft',
      createdAt: '2026-08-21T12:00:00.000Z',
      updatedAt: '2026-08-21T12:00:00.000Z',
    },
    structurePattern: {
      documentType: 'Relatório técnico',
      mainTitle: 'Relatório de atividades',
      hierarchy: [{ ...section, level: 1, order: 1, children: [section] }],
      sections: [section],
      activityPatterns: [
        {
          namePattern: 'Atividade {n}',
          sections: ['Execução'],
          order: 1,
          repeatable: true,
          fields: [field],
        },
      ],
      fields: [field],
      recurringElements: [
        {
          type: 'section',
          name: 'Atividade',
          occurrences: 3,
          evidence: ['activity-1', 'activity-2', 'activity-3'],
        },
      ],
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
    },
    fields: [field],
    activityPatterns: [
      {
        namePattern: 'Atividade {n}',
        sections: ['Execução'],
        order: 1,
        repeatable: true,
        fields: [field],
      },
    ],
    requirements: {
      requiredElements: ['Atividade', 'Execução'],
      optionalElements: ['Observações'],
      repeatableElements: ['Atividade {n}'],
    },
    writingPattern: {
      globalStyle: style,
      sectionStyles: [
        {
          ...style,
          sectionName: 'Execução',
          introductionPatterns: [],
          developmentPatterns: [writingRule],
          conclusionPatterns: [],
        },
      ],
      vocabulary: [writingRule],
      terminology: [],
      sentencePatterns: [writingRule],
      paragraphPatterns: [],
      narrativePatterns: [writingRule],
      forbiddenPatterns: [],
      recommendedPatterns: [writingRule],
    },
    semanticPattern: {
      documentType: 'Relatório técnico',
      sections: [
        {
          sectionName: 'Execução',
          purpose: 'Registrar ações e procedimentos.',
          expectedInformation: [
            {
              name: 'procedimento',
              description: 'Procedimento realizado.',
              informationType: 'procedure',
              required: true,
              evidence: [semanticEvidence],
            },
          ],
          excludedInformation: [],
          informationOrder: ['ação', 'procedimento'],
          relationships: [
            {
              targetSection: 'Resultado',
              relationship: 'A execução antecede o resultado.',
              evidence: [semanticEvidence],
            },
          ],
          narrativePattern: 'ação seguida de procedimento',
          detailLevel: 'detalhado',
          evidence: [semanticEvidence],
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
        sectionFonts: [
          { sectionName: 'Execução', fontFamily: 'Arial', fontSizePt: 11 },
        ],
        pageWidthPt: 595.3,
        pageHeightPt: 841.9,
        orientation: 'portrait',
        margins: { topPt: 72, rightPt: 60, bottomPt: 72, leftPt: 60 },
        hasPageNumbering: true,
        pageBreakCount: 1,
        pageBreakBeforeSections: ['Anexos'],
      },
      headingStyles: [
        {
          level: 2,
          sectionNames: ['Execução'],
          sourceStyleId: 'Heading2',
          formatting: { ...paragraphFormatting, bold: true, fontSizePt: 13 },
          evidence: { elementIds: ['heading-1'], occurrences: 3 },
        },
      ],
      paragraphStyles: [],
      listStyles: [],
      tableStyles: [],
      figureStyles: [],
      captionStyles: [],
      headerStyles: [],
      footerStyles: [],
      sourceStyleIds: ['Normal', 'Heading2'],
    },
  }
}
