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

function response(
  content: string,
  usedEvidenceIds = ['evidence-002'],
): string {
  return JSON.stringify({
    sectionId: section.sectionId,
    name: section.sectionName,
    content,
    usedEvidenceIds,
  })
}

describe('ReportGenerationService', () => {
  it('gera uma seção isolada com IDs de evidência permitidos', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValue(
          response('Foi realizada a substituição do HD no notebook.', [
            'evidence-002',
            'evidence-001',
          ]),
        ),
    }
    const report = await new ReportGenerationService(generator).generate(
      information,
      plan,
      template,
    )
    expect(report.sections[0]).toMatchObject({
      id: section.sectionId,
      name: 'Execução',
      order: 2,
      content: 'Foi realizada a substituição do HD no notebook.',
    })
    const prompt = generator.generateJson.mock.calls[0]?.[0] as string
    expect(prompt).toContain('Os fatos vêm exclusivamente de FACTS e ACTIVITIES')
    expect(prompt).toContain('evidence-002')
    expect(prompt).not.toContain('predominantFont')
  })

  it('rejeita IDs de evidência não permitidos', async () => {
    await expect(
      new ReportGenerationService({
        generateJson: vi
          .fn()
          .mockResolvedValue(response('Procedimento realizado.', ['inventada'])),
      }).generate(information, plan, template),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
  })

  it('corrige localmente uma seção inválida sem repetir as demais', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            sectionId: 'inventada',
            name: 'Inventada',
            content: 'Texto.',
            usedEvidenceIds: ['evidence-002'],
          }),
        )
        .mockResolvedValueOnce(response('Foi realizada a substituição do HD.')),
    }
    const report = await new ReportGenerationService(generator).generate(
      information,
      plan,
      template,
    )
    expect(report.sections).toHaveLength(1)
    expect(generator.generateJson).toHaveBeenCalledTimes(2)
    expect(generator.generateJson.mock.calls[1]?.[0]).toContain(
      'Corrija somente o JSON anterior',
    )
  })

  it('corrige um número sem evidência antes de falhar a geração', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(response('Foram realizados 3 testes.'))
        .mockResolvedValueOnce(response('Foi realizada a substituição do HD.')),
    }

    await expect(
      new ReportGenerationService(generator).generate(information, plan, template),
    ).resolves.toMatchObject({ sections: [expect.any(Object)] })
    expect(generator.generateJson).toHaveBeenCalledTimes(2)
    expect(generator.generateJson.mock.calls[1]?.[0]).toContain(
      'Remova qualquer número',
    )
  })

  it('aceita marcadores numéricos de lista como formatação', async () => {
    const report = await new ReportGenerationService({
      generateJson: vi.fn().mockResolvedValue(
        response('1. Foi realizada a substituição do HD.'),
      ),
    }).generate(information, plan, template)

    expect(report.sections).toHaveLength(1)
  })

  it('usa evidências literais após uma correção numérica sem sucesso', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValue(response('Foram realizados 3 testes.')),
    }

    const report = await new ReportGenerationService(generator).generate(
      information,
      plan,
      template,
    )

    expect(generator.generateJson).toHaveBeenCalledTimes(2)
    expect(report.sections[0]?.content).toContain('Troquei o HD')
  })
})
