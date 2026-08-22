import { expect, it } from 'vitest'
import { OllamaService } from '../ollama/ollama.service'
import { ReportExtractionService } from './report-extraction.service'

const integrationTest =
  process.env.SIEAR_OLLAMA_INTEGRATION === 'true' ? it : it.skip

integrationTest(
  'extrai informações usando o Ollama local real',
  async () => {
    const service = new ReportExtractionService(new OllamaService())

    const report = await service.extract(
      'Troquei o HD do notebook Dell e instalei Windows 11.',
    )

    expect(report.equipment, JSON.stringify(report)).not.toBeNull()
    expect(report.equipment?.toLocaleLowerCase('pt-BR')).toContain('notebook')
    expect(report.equipment?.toLocaleLowerCase('pt-BR')).toContain('dell')

    const activities = report.activities.join(' ').toLocaleLowerCase('pt-BR')
    expect(activities).toContain('hd')
    expect(activities).toContain('windows 11')
    expect(report.result).toBeNull()
    expect(report.problems).toBeNull()
    expect(report.duration).toBeNull()
    expect(report.observations).toBeNull()
  },
  180_000,
)
