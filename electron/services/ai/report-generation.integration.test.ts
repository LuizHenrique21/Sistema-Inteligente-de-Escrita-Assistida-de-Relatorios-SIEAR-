import { describe, expect, it } from 'vitest'
import { SqliteReportTemplateRepository } from '../../repositories/templates/sqlite-report-template.repository'
import { OllamaService } from '../ollama/ollama.service'
import { ReportGenerationPlanner } from '../reports/report-generation-planner'
import { ReportGenerationService } from './report-generation.service'
import type { StructuredActivity } from '../../../src/types/generated-report'

describe.skipIf(process.env.SIEAR_REPORT_GENERATION_INTEGRATION !== 'true')(
  'ReportGeneration real qwen3:8b',
  () => {
    it(
      'gera todas as seções do modelo sem evidências inventadas',
      async () => {
        const databasePath = process.env.SIEAR_REPORT_GENERATION_DATABASE
        const templateId = process.env.SIEAR_REPORT_GENERATION_TEMPLATE_ID
        if (!databasePath || !templateId)
          throw new Error(
            'Defina SIEAR_REPORT_GENERATION_DATABASE e SIEAR_REPORT_GENERATION_TEMPLATE_ID.',
          )
        const repository = new SqliteReportTemplateRepository(databasePath)
        try {
          const template = await repository.getById(templateId)
          if (!template) throw new Error('Modelo de relatório não encontrado.')
          const information: StructuredActivity = {
            facts: [
              {
                name: 'equipamento',
                label: 'Equipamento',
                value: 'notebook Dell',
                evidence: 'notebook Dell',
              },
            ],
            activities: [
              {
                description: 'Substituição do disco rígido',
                procedures: [
                  'Substituição do disco rígido',
                  'Instalação do Windows 11',
                  'Atualização dos drivers',
                ],
                result: 'O computador funcionou normalmente após os testes.',
                problems: [],
                evidence: [
                  'Troquei o HD do notebook Dell',
                  'instalei Windows 11',
                  'atualizei os drivers',
                  'fiz testes e o computador funcionou normalmente',
                ],
              },
            ],
          }
          const plan = new ReportGenerationPlanner().plan(information, template)
          const report = await new ReportGenerationService(
            new OllamaService({ model: 'qwen3:8b' }),
          ).generate(information, plan, template)
          expect(report.sections).toHaveLength(plan.sections.length)
          expect(report.sections.map((section) => section.id)).toEqual(
            plan.sections.map((section) => section.sectionId),
          )
          expect(report.sections.every((section) => section.content.trim())).toBe(
            true,
          )
        } finally {
          repository.close()
        }
      },
      30 * 60_000,
    )
  },
)
