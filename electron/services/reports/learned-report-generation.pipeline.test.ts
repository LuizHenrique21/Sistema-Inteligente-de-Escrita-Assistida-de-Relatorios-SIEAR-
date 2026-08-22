import { describe, expect, it, vi } from 'vitest'
import type {
  GeneratedReport,
  StructuredActivity,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/types/report-template'
import { LearnedReportGenerationPipeline } from './learned-report-generation.pipeline'
import { ReportGenerationPlanner } from './report-generation-planner'

const template: ReportTemplate = {
  id: 'learned',
  name: 'Modelo aprendido',
  description: 'Modelo.',
  objective: 'Registrar manutenção.',
  tone: 'técnico',
  style: 'procedimental',
  formality: 'high',
  sections: [
    {
      id: 'activities',
      name: 'Descrição da atividade',
      description: 'Ações.',
      required: true,
      order: 1,
    },
    {
      id: 'results',
      name: 'Resultado',
      description: 'Situação final.',
      required: true,
      order: 2,
    },
  ],
  fields: [
    {
      id: 'responsible',
      name: 'responsavel',
      label: 'Responsável',
      type: 'text',
      required: true,
      description: 'Responsável pela atividade.',
    },
    {
      id: 'equipment',
      name: 'equipamento',
      label: 'Equipamento',
      type: 'text',
      required: false,
      description: 'Equipamento atendido.',
    },
  ],
  writingRules: ['Usar linguagem técnica.'],
  recommendedVocabulary: ['procedimento'],
  forbiddenExpressions: [],
  semanticRules: ['Resultado deve apresentar a situação final.'],
  status: 'confirmed',
}

const incomplete: StructuredActivity = {
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
      result: 'Funcionou normalmente',
      problems: [],
      evidence: ['Troquei o HD', 'funcionou normalmente'],
    },
  ],
}

describe('ReportGenerationPlanner', () => {
  it('mapeia seções e marca campos obrigatórios ausentes', () => {
    const plan = new ReportGenerationPlanner().plan(incomplete, template)
    expect(plan.missing).toEqual([
      {
        fieldId: 'responsible',
        fieldName: 'responsavel',
        label: 'Responsável',
        question: 'Informe Responsável.',
      },
    ])
    expect(plan.sections).toEqual([
      {
        sectionId: 'activities',
        sectionName: 'Descrição da atividade',
        order: 1,
        factNames: ['equipamento'],
        activityIndexes: [0],
      },
      {
        sectionId: 'results',
        sectionName: 'Resultado',
        order: 2,
        factNames: ['equipamento'],
        activityIndexes: [0],
      },
    ])
  })
})

describe('LearnedReportGenerationPipeline', () => {
  it('retorna perguntas e não gera texto quando faltam informações', async () => {
    const writer = { generate: vi.fn() }
    const pipeline = new LearnedReportGenerationPipeline(
      { extract: vi.fn().mockResolvedValue(incomplete) },
      new ReportGenerationPlanner(),
      writer,
    )
    const result = await pipeline.generate(
      'Troquei o HD do notebook.',
      template,
    )
    expect(result).toMatchObject({
      success: true,
      requiresInput: true,
      questions: ['Informe Responsável.'],
    })
    expect(writer.generate).not.toHaveBeenCalled()
  })

  it('gera somente depois que todos os campos obrigatórios estão presentes', async () => {
    const complete: StructuredActivity = {
      ...incomplete,
      facts: [
        ...incomplete.facts,
        {
          name: 'responsavel',
          label: 'Responsável',
          value: 'Ana',
          evidence: 'Ana',
        },
      ],
    }
    const report: GeneratedReport = {
      id: 'report',
      templateId: template.id,
      templateName: template.name,
      sections: [],
      createdAt: '2026-08-21T00:00:00.000Z',
    }
    const writer = { generate: vi.fn().mockResolvedValue(report) }
    const pipeline = new LearnedReportGenerationPipeline(
      { extract: vi.fn().mockResolvedValue(complete) },
      new ReportGenerationPlanner(),
      writer,
    )
    await expect(
      pipeline.generate('Ana trocou o HD.', template),
    ).resolves.toEqual({ success: true, data: report })
    expect(writer.generate).toHaveBeenCalledWith(
      complete,
      expect.objectContaining({ missing: [] }),
      template,
    )
  })
})
