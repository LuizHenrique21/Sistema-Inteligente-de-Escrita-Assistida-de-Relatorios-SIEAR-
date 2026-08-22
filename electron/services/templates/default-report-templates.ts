import type { ReportTemplate } from '../../../src/types/report-template'

export const TECHNICAL_REPORT_TEMPLATE: ReportTemplate = {
  id: 'technical-report',
  name: 'Relatório Técnico',
  description: 'Modelo para documentação de atividades técnicas.',
  objective:
    'Registrar procedimentos técnicos realizados, resultados obtidos e observações relevantes.',
  tone: 'formal',
  style: 'technical',
  formality: 'high',
  sections: [
    {
      id: 'introduction',
      name: 'Introdução',
      description: 'Contextualização da atividade técnica.',
      required: true,
      order: 1,
    },
    {
      id: 'activities',
      name: 'Atividades Realizadas',
      description: 'Procedimentos e atividades executados.',
      required: true,
      order: 2,
    },
    {
      id: 'results',
      name: 'Resultados',
      description: 'Resultados observados após as atividades.',
      required: true,
      order: 3,
    },
    {
      id: 'conclusion',
      name: 'Conclusão',
      description: 'Síntese final das atividades e resultados.',
      required: true,
      order: 4,
    },
  ],
  writingRules: [
    'Utilizar linguagem formal.',
    'Evitar informações não fornecidas pelo usuário.',
    'Priorizar clareza e objetividade.',
    'Utilizar terminologia técnica quando apropriado.',
  ],
  recommendedVocabulary: [],
  forbiddenExpressions: [],
}
