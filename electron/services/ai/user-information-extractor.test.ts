import { describe, expect, it, vi } from 'vitest'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { UserInformationExtractor } from './user-information-extractor'

const template = createRichReportTemplate()

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

  it('usa fallback literal quando a IA retorna evidência inventada ou JSON inválido', async () => {
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
    const expected = {
      facts: [],
      activities: [
        {
          description: 'Troquei o HD.',
          procedures: ['Troquei o HD.'],
          result: null,
          problems: [],
          evidence: ['Troquei o HD.'],
        },
      ],
    }
    await expect(
      new UserInformationExtractor({
        generateJson: vi.fn().mockResolvedValue(JSON.stringify(invented)),
      }).extract('Troquei o HD.', template),
    ).resolves.toEqual(expected)
    await expect(
      new UserInformationExtractor({
        generateJson: vi.fn().mockResolvedValue('texto'),
      }).extract('Troquei o HD.', template),
    ).resolves.toEqual(expected)
  })

  it('normaliza espaços em evidências literais e repara uma primeira resposta inválida', async () => {
    const valid = {
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
          evidence: ['Troquei  o HD'],
        },
      ],
    }
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValueOnce(
          JSON.stringify({
            facts: [],
            activities: [
              {
                ...valid.activities[0],
                evidence: ['trecho inexistente'],
              },
            ],
          }),
        )
        .mockResolvedValueOnce(JSON.stringify(valid)),
    }

    await expect(
      new UserInformationExtractor(generator).extract(
        'Troquei o HD do notebook.',
        template,
      ),
    ).resolves.toEqual(valid)
    expect(generator.generateJson).toHaveBeenCalledTimes(2)
  })
})
