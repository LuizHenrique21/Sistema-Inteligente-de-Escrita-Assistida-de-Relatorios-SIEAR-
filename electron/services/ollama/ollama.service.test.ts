import { afterEach, describe, expect, it, vi } from 'vitest'
import { OllamaService, OllamaServiceError } from './ollama.service'

const service = new OllamaService()

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('OllamaService', () => {
  it('publica métricas de tokens quando o Ollama as fornece', async () => {
    const onMetrics = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({
            message: { content: '{}' },
            prompt_eval_count: 120,
            eval_count: 30,
            prompt_eval_duration: 2_000_000_000,
            eval_duration: 3_000_000_000,
          }),
          { status: 200 },
        ),
      ),
    )

    await new OllamaService({ onMetrics }).generateJson('Prompt')

    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        promptBytes: 6,
        responseBytes: 2,
        promptCharacters: 6,
        responseCharacters: 2,
        promptTokens: 120,
        generatedTokens: 30,
        promptEvaluationMs: 2000,
        generationMs: 3000,
        tokensPerSecond: 10,
      }),
    )
  })

  it('publica null quando o Ollama não fornece métricas opcionais', async () => {
    const onMetrics = vi.fn()
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { content: '{}' } }), {
          status: 200,
        }),
      ),
    )

    await new OllamaService({ onMetrics }).generateJson('Prompt')

    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        promptTokens: null,
        generatedTokens: null,
        promptEvaluationMs: null,
        generationMs: null,
        tokensPerSecond: null,
      }),
    )
  })

  it('não inclui prompt nem resposta nas métricas publicadas', async () => {
    const onMetrics = vi.fn()
    const sensitivePrompt = 'SEGREDO-NO-PROMPT'
    const sensitiveResponse = 'SEGREDO-NA-RESPOSTA'
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(
          JSON.stringify({ message: { content: sensitiveResponse } }),
          { status: 200 },
        ),
      ),
    )

    await new OllamaService({ onMetrics }).generateJson(sensitivePrompt)

    const published = JSON.stringify(onMetrics.mock.calls[0]?.[0])
    expect(published).not.toContain(sensitivePrompt)
    expect(published).not.toContain(sensitiveResponse)
    expect(onMetrics).toHaveBeenCalledWith(
      expect.objectContaining({
        promptBytes: Buffer.byteLength(sensitivePrompt),
        responseBytes: Buffer.byteLength(sensitiveResponse),
      }),
    )
  })

  it('não deixa uma falha do observador alterar a resposta funcional', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { content: '{}' } }), {
          status: 200,
        }),
      ),
    )
    const serviceWithFailingObserver = new OllamaService({
      onMetrics: () => {
        throw new Error('falha exclusiva da instrumentação')
      },
    })

    await expect(
      serviceWithFailingObserver.generateJson('Prompt'),
    ).resolves.toBe('{}')
  })

  it('permite configurar o timeout para análises locais longas', async () => {
    const timeout = vi.spyOn(AbortSignal, 'timeout')
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ message: { content: '{}' } }), {
          status: 200,
        }),
      ),
    )

    await new OllamaService({ timeoutMs: 456_000 }).generateJson('Prompt')

    expect(timeout).toHaveBeenCalledWith(456_000)
    timeout.mockRestore()
  })

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

  it('solicita formato JSON ao gerar conteúdo estruturado', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ message: { content: '{}' } }), {
        status: 200,
      }),
    )
    vi.stubGlobal('fetch', fetchMock)

    await service.generateJson('Prompt estruturado')

    const options = fetchMock.mock.calls[0]?.[1] as RequestInit
    expect(JSON.parse(String(options.body))).toMatchObject({ format: 'json' })
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
