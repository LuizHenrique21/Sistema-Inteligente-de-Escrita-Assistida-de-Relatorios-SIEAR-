import { describe, expect, it, vi } from 'vitest'
import type { StructuredActivity } from '../../../src/types/generated-report'
import { ReportGenerationPlanner } from '../reports/report-generation-planner'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { ReportGenerationService } from './report-generation.service'

const template = createRichReportTemplate('template')
template.structurePattern.hierarchy = [template.structurePattern.sections[0]!]
template.fields = []
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
const plan = new ReportGenerationPlanner().plan(information, template)
const section = plan.sections[0]!

function response(content: string, usedEvidence = ['Troquei o HD']): string {
  return JSON.stringify({
    sections: [
      {
        sectionId: section.sectionId,
        name: section.sectionName,
        content,
        usedEvidence,
      },
    ],
  })
}

describe('ReportGenerationService', () => {
  it('preenche a estrutura determinada pelo plano usando evidências fornecidas', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValue(
          response('Foi realizada a substituição do HD no notebook.', [
            'Troquei o HD',
            'notebook',
          ]),
        ),
    }
    const report = await new ReportGenerationService(generator).generate(
      information,
      plan,
      template,
    )
    expect(report).toMatchObject({
      templateId: 'template',
      templateName: 'Modelo técnico',
    })
    expect(report.sections[0]).toMatchObject({
      id: section.sectionId,
      name: 'Execução',
      order: 2,
      elements: [
        {
          type: 'paragraph',
          content: 'Foi realizada a substituição do HD no notebook.',
        },
      ],
    })
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain('StructuredActivity é a única fonte de fatos')
    expect(prompt).toContain('terceira pessoa')
    expect(prompt).toContain('A execução antecede o resultado.')
    expect(prompt).not.toContain('predominantFont')
  })

  it('rejeita evidência e número não fornecidos', async () => {
    await expect(
      new ReportGenerationService({
        generateJson: vi
          .fn()
          .mockResolvedValue(
            response('Procedimento realizado.', ['teste inexistente']),
          ),
      }).generate(information, plan, template),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
    await expect(
      new ReportGenerationService({
        generateJson: vi
          .fn()
          .mockResolvedValue(response('Foram realizados 3 testes.')),
      }).generate(information, plan, template),
    ).rejects.toThrow('número')
  })

  it('rejeita seção fora do plano e seção obrigatória ausente', async () => {
    const unknown = JSON.stringify({
      sections: [
        {
          sectionId: 'inventada',
          name: 'Inventada',
          content: 'Texto.',
          usedEvidence: ['Troquei o HD'],
        },
      ],
    })
    await expect(
      new ReportGenerationService({
        generateJson: vi.fn().mockResolvedValue(unknown),
      }).generate(information, plan, template),
    ).rejects.toThrow('inexistentes')
    await expect(
      new ReportGenerationService({
        generateJson: vi.fn().mockResolvedValue('{"sections":[]}'),
      }).generate(information, plan, template),
    ).rejects.toThrow('plano de geração')
  })
})
