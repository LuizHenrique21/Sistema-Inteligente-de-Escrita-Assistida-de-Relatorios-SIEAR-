import { describe, expect, it, vi } from 'vitest'
import type {
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/types/report-template'
import { LearnedReportGenerationService } from './learned-report-generation.service'

const template: ReportTemplate = {
  id: 'learned',
  name: 'Modelo aprendido',
  description: 'Modelo.',
  objective: 'Registrar.',
  tone: 'técnico',
  style: 'procedimental',
  formality: 'high',
  sections: [
    {
      id: 'activity',
      name: 'Atividade',
      description: 'Atividade executada.',
      required: true,
      order: 1,
    },
  ],
  fields: [],
  writingRules: ['Escrever objetivamente.'],
  recommendedVocabulary: ['procedimento'],
  forbiddenExpressions: ['eu acho'],
  semanticRules: ['Atividade descreve ação e procedimento.'],
  documentType: 'Relatório técnico',
}
const information: StructuredActivity = {
  facts: [
    {
      name: 'equipamento',
      label: 'Equipamento',
      value: 'notebook',
      evidence: 'notebook',
    },
  ],
  activities: [
    {
      description: 'Substituição do HD',
      procedures: ['Substituição do HD'],
      result: null,
      problems: [],
      evidence: ['Troquei o HD'],
    },
  ],
}
const plan: ReportGenerationPlan = {
  missing: [],
  sections: [
    {
      sectionId: 'activity',
      sectionName: 'Atividade',
      order: 1,
      factNames: ['equipamento'],
      activityIndexes: [0],
    },
  ],
}

describe('LearnedReportGenerationService', () => {
  it('gera seções do template usando evidências fornecidas', async () => {
    const response = JSON.stringify({
      sections: [
        {
          name: 'Atividade',
          content: 'Foi realizada a substituição do HD no notebook.',
          usedEvidence: ['Troquei o HD', 'notebook'],
        },
      ],
    })
    const generator = { generateJson: vi.fn().mockResolvedValue(response) }
    const report = await new LearnedReportGenerationService(generator).generate(
      information,
      plan,
      template,
    )
    expect(report.sections[0]).toMatchObject({
      id: 'activity',
      name: 'Atividade',
      order: 1,
    })
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain('O template define COMO escrever')
    expect(prompt).toContain('Atividade descreve ação e procedimento.')
    expect(prompt).not.toContain('DOCX')
  })

  it('rejeita evidência e número não fornecidos pelo usuário', async () => {
    const inventedEvidence = JSON.stringify({
      sections: [
        {
          name: 'Atividade',
          content: 'Procedimento realizado.',
          usedEvidence: ['teste inexistente'],
        },
      ],
    })
    await expect(
      new LearnedReportGenerationService({
        generateJson: vi.fn().mockResolvedValue(inventedEvidence),
      }).generate(information, plan, template),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
    const inventedNumber = JSON.stringify({
      sections: [
        {
          name: 'Atividade',
          content: 'Foram realizados 3 testes.',
          usedEvidence: ['Troquei o HD'],
        },
      ],
    })
    await expect(
      new LearnedReportGenerationService({
        generateJson: vi.fn().mockResolvedValue(inventedNumber),
      }).generate(information, plan, template),
    ).rejects.toThrow('número')
  })

  it('rejeita seção inexistente e obrigatória ausente', async () => {
    const unknown = JSON.stringify({
      sections: [
        {
          name: 'Inventada',
          content: 'Texto.',
          usedEvidence: ['Troquei o HD'],
        },
      ],
    })
    await expect(
      new LearnedReportGenerationService({
        generateJson: vi.fn().mockResolvedValue(unknown),
      }).generate(information, plan, template),
    ).rejects.toThrow('inexistentes')
    const absent = JSON.stringify({ sections: [] })
    await expect(
      new LearnedReportGenerationService({
        generateJson: vi.fn().mockResolvedValue(absent),
      }).generate(information, plan, template),
    ).rejects.toThrow('obrigatória')
  })
})
