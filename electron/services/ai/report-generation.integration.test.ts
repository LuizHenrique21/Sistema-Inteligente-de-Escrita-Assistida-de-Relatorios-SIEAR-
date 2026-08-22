import { expect, it } from 'vitest'
import type { ReportInformation } from '../../../src/types/siear-api'
import { OllamaService } from '../ollama/ollama.service'
import { TECHNICAL_REPORT_TEMPLATE } from '../templates/default-report-templates'
import { ReportGenerationService } from './report-generation.service'

const integrationTest =
  process.env.SIEAR_OLLAMA_INTEGRATION === 'true' ? it : it.skip

integrationTest(
  'gera um relatório estruturado usando o Ollama local real',
  async () => {
    const information: ReportInformation = {
      equipment: 'Notebook Dell',
      activities: ['Substituição do HD', 'Instalação do Windows 11'],
      result: null,
      problems: null,
      duration: null,
      observations: null,
    }
    const ollama = new OllamaService()
    const service = new ReportGenerationService({
      generateJson(
        prompt: string,
        schema?: Record<string, unknown>,
      ): Promise<string> {
        return ollama.generateJson(prompt, schema)
      },
    })

    const report = await service.generate(
      information,
      TECHNICAL_REPORT_TEMPLATE,
    )

    expect(report.sections.map((section) => section.name)).toEqual([
      'Introdução',
      'Atividades Realizadas',
      'Resultados',
      'Conclusão',
    ])
    const content = report.sections
      .map((section) => section.content)
      .join(' ')
      .toLocaleLowerCase('pt-BR')
    expect(content).toContain('notebook dell')
    expect(content).toContain('hd')
    expect(content).toContain('windows 11')
    expect(content).not.toContain('2 horas')
    expect(content).not.toContain('testado com sucesso')
  },
  180_000,
)
