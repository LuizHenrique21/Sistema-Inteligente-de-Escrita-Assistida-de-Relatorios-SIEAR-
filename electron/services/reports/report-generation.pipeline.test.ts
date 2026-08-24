import { describe, expect, it, vi } from 'vitest'
import type {
  GeneratedReport,
  StructuredActivity,
} from '../../../src/types/generated-report'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { ReportGenerationPipeline } from './report-generation.pipeline'
import { ReportGenerationPlanner } from './report-generation-planner'

const template = createRichReportTemplate('template')
template.structurePattern.hierarchy = [template.structurePattern.sections[0]!]
template.fields = [{ ...template.fields[0]!, required: true }]

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
  it('preserva o template rico no plano e detecta informação obrigatória ausente', () => {
    const plan = new ReportGenerationPlanner().plan(incomplete, template)
    expect(plan.missing[0]).toMatchObject({
      fieldName: 'responsavel',
      label: 'Responsável',
    })
    expect(plan.groundingPolicy).toEqual({
      sourceOfFacts: 'structured-activity-only',
      templateIsNotFactSource: true,
      requireEvidence: true,
      prohibitUnsupportedFacts: true,
    })
    expect(plan.sections[0]).toMatchObject({
      sectionName: 'Execução',
      level: 2,
      required: true,
      repeatable: false,
      semantics: { purpose: 'Registrar ações e procedimentos.' },
      writingStyle: {
        grammaticalPerson: 'terceira pessoa',
        verbTense: 'pretérito',
        voice: 'passiva',
      },
      formatting: { headingStyles: [{ sourceStyleId: 'Heading2' }] },
    })
    expect(
      plan.sections[0]?.semantics?.relationships[0]?.evidence[0]?.reason,
    ).toBe('O trecho contém ação e procedimento.')
    expect(
      plan.templateContext.structurePattern.hierarchy[0]?.children,
    ).toEqual(template.structurePattern.hierarchy[0]?.children)
    expect(plan.templateContext.fields[0]?.evidence[0]).toEqual(
      template.fields[0]?.evidence[0],
    )
    expect(
      plan.templateContext.activityPatterns[0]?.fields[0]?.evidence,
    ).toEqual(template.activityPatterns[0]?.fields[0]?.evidence)
    expect(
      plan.templateContext.writingPattern.recommendedPatterns[0]?.evidence,
    ).toEqual(template.writingPattern.recommendedPatterns[0]?.evidence)
    expect(
      plan.templateContext.semanticPattern.sections[0]?.relationships,
    ).toEqual(template.semanticPattern.sections[0]?.relationships)
    expect(
      plan.templateContext.formattingPattern.documentStyle.margins,
    ).toEqual(template.formattingPattern.documentStyle.margins)
  })
})

describe('ReportGenerationPipeline', () => {
  it('faz perguntas e não chama o redator quando faltam dados', async () => {
    const writer = { generate: vi.fn() }
    const pipeline = new ReportGenerationPipeline(
      { extract: vi.fn().mockResolvedValue(incomplete) },
      new ReportGenerationPlanner(),
      writer,
    )
    const result = await pipeline.generate('Troquei o HD.', template)
    expect(result).toMatchObject({
      success: true,
      requiresInput: true,
      questions: ['Informe Responsável.'],
    })
    expect(writer.generate).not.toHaveBeenCalled()
  })

  it('gera somente após preencher os dados obrigatórios', async () => {
    const complete = {
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
      templateId: template.metadata.id,
      templateName: template.metadata.name,
      sections: [],
      createdAt: '2026-08-21T00:00:00.000Z',
    }
    const writer = { generate: vi.fn().mockResolvedValue(report) }
    const pipeline = new ReportGenerationPipeline(
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
