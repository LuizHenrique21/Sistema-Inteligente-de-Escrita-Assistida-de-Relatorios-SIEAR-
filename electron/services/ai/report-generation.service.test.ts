import { describe, expect, it, vi } from 'vitest'
import type { ReportTemplate } from '../../../src/types/report-template'
import type { ReportInformation } from '../../../src/types/siear-api'
import { TECHNICAL_REPORT_TEMPLATE } from '../templates/default-report-templates'
import { ReportPromptBuilder } from './prompts/report-generation.prompt'
import {
  ReportGenerationService,
  ReportGenerationServiceError,
} from './report-generation.service'

const information: ReportInformation = {
  equipment: 'Notebook Dell',
  activities: ['Substituição do HD', 'Instalação do Windows 11'],
  result: null,
  problems: null,
  duration: null,
  observations: null,
}

function response(sections: Array<{ name: string; content: string }>): string {
  return JSON.stringify({ sections })
}

function generator(output: string) {
  return { generateJson: vi.fn().mockResolvedValue(output) }
}

const validSections = [
  { name: 'Introdução', content: 'Atividade realizada em Notebook Dell.' },
  {
    name: 'Atividades Realizadas',
    content: 'Foram realizados a substituição do HD e o Windows 11.',
  },
  { name: 'Resultados', content: 'Não foram fornecidos dados de resultado.' },
  { name: 'Conclusão', content: 'As atividades informadas foram registradas.' },
]

describe('ReportPromptBuilder', () => {
  it('separa como escrever dos fatos e inclui todas as regras', () => {
    const prompt = new ReportPromptBuilder().build(
      information,
      TECHNICAL_REPORT_TEMPLATE,
    )
    expect(prompt).toContain('O modelo define COMO escrever')
    expect(prompt).toContain('Não invente resultados')
    expect(prompt).toContain('Substituição do HD')
    expect(prompt).toContain('Utilizar linguagem formal.')
    expect(prompt).toContain('1. Introdução (obrigatória)')
    expect(prompt).toContain('Responda exclusivamente com JSON válido')
  })
})

describe('ReportGenerationService', () => {
  it('gera todas as seções obrigatórias sem criar resultado ausente', async () => {
    const service = new ReportGenerationService(
      generator(response(validSections)),
    )
    const report = await service.generate(
      information,
      TECHNICAL_REPORT_TEMPLATE,
    )

    expect(report.templateId).toBe('technical-report')
    expect(report.sections.map((section) => section.name)).toEqual(
      TECHNICAL_REPORT_TEMPLATE.sections.map((section) => section.name),
    )
    expect(report.sections[2]?.content).toContain('Não foram fornecidos')
    expect(report.createdAt).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('mantém fatos de resultado, duração e testes fornecidos', async () => {
    const completeInformation: ReportInformation = {
      ...information,
      activities: [...information.activities, 'Testes de funcionamento'],
      result: 'Equipamento funcionando normalmente',
      duration: '2 horas',
    }
    const output = validSections.map((section) => ({
      ...section,
      content: `${section.content} Equipamento funcionando normalmente em 2 horas.`,
    }))
    const service = new ReportGenerationService(generator(response(output)))

    const report = await service.generate(
      completeInformation,
      TECHNICAL_REPORT_TEMPLATE,
    )
    expect(
      report.sections.some((section) => section.content.includes('2 horas')),
    ).toBe(true)
  })

  it('aceita seção obrigatória de problemas com formulação neutra', async () => {
    const template: ReportTemplate = {
      ...TECHNICAL_REPORT_TEMPLATE,
      sections: [
        ...TECHNICAL_REPORT_TEMPLATE.sections.slice(0, 2),
        {
          id: 'problems',
          name: 'Problemas Encontrados',
          description: 'Problemas informados.',
          required: true,
          order: 3,
        },
        ...TECHNICAL_REPORT_TEMPLATE.sections.slice(2).map((section) => ({
          ...section,
          order: section.order + 1,
        })),
      ],
    }
    const sections = [
      ...validSections.slice(0, 2),
      {
        name: 'Problemas Encontrados',
        content: 'Não foram informados problemas.',
      },
      ...validSections.slice(2),
    ]
    const service = new ReportGenerationService(generator(response(sections)))
    const report = await service.generate(information, template)
    expect(report.sections[2]?.content).toBe('Não foram informados problemas.')
  })

  it('rejeita resposta que não seja JSON', async () => {
    const service = new ReportGenerationService(generator('texto livre'))
    await expect(
      service.generate(information, TECHNICAL_REPORT_TEMPLATE),
    ).rejects.toMatchObject({
      code: 'INVALID_MODEL_RESPONSE',
    } satisfies Partial<ReportGenerationServiceError>)
  })

  it('rejeita seção inexistente no template', async () => {
    const service = new ReportGenerationService(
      generator(
        response([
          ...validSections,
          { name: 'Seção Inventada', content: 'Conteúdo.' },
        ]),
      ),
    )
    await expect(
      service.generate(information, TECHNICAL_REPORT_TEMPLATE),
    ).rejects.toThrow('não existe no modelo')
  })

  it('rejeita seção obrigatória ausente', async () => {
    const service = new ReportGenerationService(
      generator(
        response(
          validSections.filter((section) => section.name !== 'Resultados'),
        ),
      ),
    )
    await expect(
      service.generate(information, TECHNICAL_REPORT_TEMPLATE),
    ).rejects.toThrow('omitiu uma seção obrigatória')
  })

  it('rejeita seções fora da ordem do template', async () => {
    const service = new ReportGenerationService(
      generator(
        response([
          validSections[1]!,
          validSections[0]!,
          ...validSections.slice(2),
        ]),
      ),
    )
    await expect(
      service.generate(information, TECHNICAL_REPORT_TEMPLATE),
    ).rejects.toThrow('fora da ordem')
  })
})
