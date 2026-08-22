import { describe, expect, it, vi } from 'vitest'
import type { ReportTemplate } from '../../../src/types/report-template'
import { UserInformationExtractor } from './user-information-extractor'

const template = {
  name: 'Modelo',
  documentType: 'Relatório',
  fields: [],
  sections: [],
  semanticRules: [],
} as unknown as ReportTemplate

describe('UserInformationExtractor', () => {
  it('interpreta fatos e atividades mantendo evidências literais', async () => {
    const output = {
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
          result: 'funcionou normalmente',
          problems: [],
          evidence: ['Troquei o HD', 'funcionou normalmente'],
        },
      ],
    }
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(output)),
    }
    const result = await new UserInformationExtractor(generator).extract(
      'Troquei o HD do notebook e funcionou normalmente.',
      template,
    )
    expect(result).toEqual(output)
    expect(generator.generateJson).toHaveBeenCalledWith(
      expect.stringContaining('Não invente datas'),
      expect.any(Object),
    )
  })

  it('rejeita evidência inventada e JSON inválido', async () => {
    const invented = {
      facts: [],
      activities: [
        {
          description: 'Teste',
          procedures: ['Teste'],
          result: null,
          problems: [],
          evidence: ['trecho inexistente'],
        },
      ],
    }
    await expect(
      new UserInformationExtractor({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(invented)),
      }).extract('Troquei o HD.', template),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
    await expect(
      new UserInformationExtractor({
        generateJson: vi.fn().mockResolvedValue('texto'),
      }).extract('Troquei o HD.', template),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
  })
})
