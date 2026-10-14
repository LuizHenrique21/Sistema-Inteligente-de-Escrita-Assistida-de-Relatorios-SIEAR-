import { describe, expect, it, vi } from 'vitest'
import { reviewReportGrounding } from './report-grounding-review'

describe('report grounding review', () => {
  it('removes unsupported claims without rewriting facts or losing section metadata', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValue(
          JSON.stringify({ unsupportedSentenceIds: ['s2', 's4'] }),
        ),
    }
    const sections = [
      {
        id: 'context',
        content:
          'Organizei os livros da biblioteca. A produtividade aumentou 50%.\n\nSeparei os livros por assunto.',
      },
      {
        id: 'result',
        content:
          'Todos os leitores aprovaram a mudança. A organização foi concluída.',
      },
    ]
    const source = 'Organizei os livros da biblioteca por assunto.'
    const result = await reviewReportGrounding(generator, sections, source)
    expect(result.removedSentences).toBe(2)
    expect(result.sections).toEqual([
      {
        id: 'context',
        content:
          'Organizei os livros da biblioteca.\n\nSeparei os livros por assunto.',
      },
      { id: 'result', content: 'A organização foi concluída.' },
    ])
    expect(sections[0]!.content).toContain('50%')
    expect(generator.generateJson.mock.calls[0]![0]).toContain(
      JSON.stringify(source),
    )
  })

  it('does not replace a fully rejected section with an invented answer', async () => {
    const generator = {
      generateJson: vi
        .fn()
        .mockResolvedValue('{"unsupportedSentenceIds":["s1"]}'),
    }
    const result = await reviewReportGrounding(
      generator,
      [{ content: 'Foram realizados testes com cinco usuários.' }],
      'Ajustei o formulário.',
    )
    expect(result.sections[0]!.content).toBe('')
  })

  it.each([
    'não é JSON',
    '{"unsupportedSentenceIds":["s99"]}',
    '{"unsupportedSentenceIds":["s1","s1"]}',
    '{"unsupportedSentenceIds":[],"replacement":"Fatos novos"}',
    '{"unsupportedSentenceIds":[1]}',
    'null',
  ])('rejects invalid review responses: %s', async (response) => {
    const generator = { generateJson: vi.fn().mockResolvedValue(response) }
    await expect(
      reviewReportGrounding(
        generator,
        [{ content: 'Ajustei o formulário.' }],
        'Ajustei o formulário.',
      ),
    ).rejects.toMatchObject({ code: 'INVALID_MODEL_RESPONSE' })
  })
})
