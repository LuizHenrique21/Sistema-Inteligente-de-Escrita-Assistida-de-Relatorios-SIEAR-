import { describe, expect, it, vi } from 'vitest'
import type { ReportInformation } from '../../../src/types/siear-api'
import { buildReportExtractionPrompt } from './prompts/report-extraction.prompt'
import {
  ReportExtractionService,
  ReportExtractionServiceError,
} from './report-extraction.service'

function createService(response: unknown) {
  const generator = {
    generateJson: vi
      .fn()
      .mockResolvedValue(
        typeof response === 'string' ? response : JSON.stringify(response),
      ),
  }
  return { service: new ReportExtractionService(generator), generator }
}

const emptyFields = {
  result: null,
  problems: null,
  duration: null,
  observations: null,
} as const

describe('ReportExtractionService', () => {
  it('constrói um prompt que proíbe invenções e exige o contrato completo', () => {
    const prompt = buildReportExtractionPrompt('Troquei o HD.')

    expect(prompt).toContain('Não invente fatos')
    expect(prompt).toContain('não faça suposições')
    expect(prompt).toContain('Responda exclusivamente com um objeto JSON')
    expect(prompt).toContain('"activities": []')
    expect(prompt).toContain('<description>\nTroquei o HD.\n</description>')
  })

  it('extrai a troca de HD sem inventar campos ausentes', async () => {
    const expected: ReportInformation = {
      equipment: 'notebook',
      activities: ['Substituição do HD'],
      ...emptyFields,
    }
    const { service } = createService(expected)

    await expect(service.extract('Troquei o HD do notebook.')).resolves.toEqual(
      expected,
    )
  })

  it('preserva problema informado sem inventar resultado', async () => {
    const expected: ReportInformation = {
      equipment: 'notebook Dell',
      activities: ['Instalação do Windows 11'],
      result: null,
      problems: 'Problema no driver de vídeo',
      duration: null,
      observations: null,
    }
    const { service } = createService(expected)

    await expect(
      service.extract(
        'Instalei Windows 11 no notebook Dell. O equipamento apresentou problema no driver de vídeo.',
      ),
    ).resolves.toEqual(expected)
  })

  it('preserva múltiplas atividades e o resultado informado', async () => {
    const expected: ReportInformation = {
      equipment: null,
      activities: [
        'Substituição do HD',
        'Instalação do Windows 11',
        'Realização de testes',
      ],
      result: 'O equipamento funcionou normalmente',
      problems: null,
      duration: null,
      observations: null,
    }
    const { service } = createService(expected)

    await expect(
      service.extract(
        'Troquei o HD, instalei Windows 11 e fiz testes. O equipamento funcionou normalmente.',
      ),
    ).resolves.toEqual(expected)
  })

  it('aceita entrada curta sem preencher informações inexistentes', async () => {
    const expected: ReportInformation = {
      equipment: null,
      activities: ['Substituição do HD'],
      ...emptyFields,
    }
    const { service } = createService(expected)

    await expect(service.extract('Troquei o HD.')).resolves.toEqual(expected)
  })

  it('retorna erro controlado quando o Ollama não responde com JSON', async () => {
    const { service } = createService('Não consegui entender.')

    await expect(service.extract('Troquei o HD.')).rejects.toMatchObject({
      code: 'INVALID_MODEL_RESPONSE',
    } satisfies Partial<ReportExtractionServiceError>)
  })

  it.each([
    {},
    { equipment: 'Notebook' },
    {
      equipment: null,
      activities: 'Substituição do HD',
      ...emptyFields,
    },
    {
      equipment: 123,
      activities: [],
      ...emptyFields,
    },
    {
      equipment: null,
      activities: [null],
      ...emptyFields,
    },
  ])('rejeita contrato estruturalmente inválido: %o', async (response) => {
    const { service } = createService(response)

    await expect(service.extract('Descrição')).rejects.toMatchObject({
      code: 'INVALID_MODEL_RESPONSE',
    } satisfies Partial<ReportExtractionServiceError>)
  })
})
