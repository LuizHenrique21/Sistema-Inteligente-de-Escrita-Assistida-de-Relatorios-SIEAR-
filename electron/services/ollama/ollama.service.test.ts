import { afterEach, describe, expect, it, vi } from 'vitest'
import { OllamaService, OllamaServiceError } from './ollama.service'

const service = new OllamaService()

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OllamaService', () => {
  it('envia o contrato esperado e retorna o conteúdo gerado', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: 'Resposta local.' } }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
      )
    vi.stubGlobal('fetch', fetchMock)

    await expect(service.generate('Meu prompt')).resolves.toBe(
      'Resposta local.',
    )
    expect(fetchMock).toHaveBeenCalledOnce()

    const [url, options] = fetchMock.mock.calls[0] as [string, RequestInit]
    expect(url).toBe('http://localhost:11434/api/chat')
    expect(options.method).toBe('POST')
    expect(JSON.parse(String(options.body))).toEqual({
      model: 'qwen3:8b',
      messages: [{ role: 'user', content: 'Meu prompt' }],
      stream: false,
    })
  })

  it('converte timeout em erro compreensível', async () => {
    const timeout = new Error('timeout')
    timeout.name = 'TimeoutError'
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(timeout))

    await expect(service.generate('Prompt')).rejects.toMatchObject({
      code: 'TIMEOUT',
    } satisfies Partial<OllamaServiceError>)
  })

  it('informa quando o modelo não existe', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{}', { status: 404 })),
    )

    await expect(service.generate('Prompt')).rejects.toMatchObject({
      code: 'MODEL_NOT_FOUND',
    } satisfies Partial<OllamaServiceError>)
  })

  it('rejeita JSON inválido', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(new Response('{inválido', { status: 200 })),
    )

    await expect(service.generate('Prompt')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    } satisfies Partial<OllamaServiceError>)
  })

  it.each([
    {},
    { message: null },
    { message: {} },
    { message: { content: '' } },
  ])('rejeita resposta com formato inválido: %o', async (payload) => {
    vi.stubGlobal(
      'fetch',
      vi
        .fn()
        .mockResolvedValue(
          new Response(JSON.stringify(payload), { status: 200 }),
        ),
    )

    await expect(service.generate('Prompt')).rejects.toMatchObject({
      code: 'INVALID_RESPONSE',
    } satisfies Partial<OllamaServiceError>)
  })
})
