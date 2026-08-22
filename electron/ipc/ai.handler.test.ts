import { describe, expect, it, vi } from 'vitest'
import { OllamaServiceError } from '../services/ollama/ollama.service'
import { createAiGenerateHandler } from './ai.handler'

describe('contrato ai:generate', () => {
  it.each([undefined, null, {}, { prompt: 123 }, { prompt: '   ' }])(
    'rejeita payload inválido: %o',
    async (request) => {
      const service = { generate: vi.fn() }
      const handle = createAiGenerateHandler(service)

      await expect(handle(request)).resolves.toEqual({
        ok: false,
        error: {
          code: 'INVALID_PROMPT',
          message: 'Digite um prompt antes de enviar para a IA.',
        },
      })
      expect(service.generate).not.toHaveBeenCalled()
    },
  )

  it('normaliza o prompt e retorna o contrato de sucesso', async () => {
    const service = { generate: vi.fn().mockResolvedValue('Conteúdo') }
    const handle = createAiGenerateHandler(service)

    await expect(handle({ prompt: '  Prompt  ' })).resolves.toEqual({
      ok: true,
      content: 'Conteúdo',
    })
    expect(service.generate).toHaveBeenCalledWith('Prompt')
  })

  it('serializa erros conhecidos sem expor stack trace', async () => {
    const service = {
      generate: vi
        .fn()
        .mockRejectedValue(
          new OllamaServiceError(
            'MODEL_NOT_FOUND',
            'O modelo configurado não está instalado.',
          ),
        ),
    }
    const handle = createAiGenerateHandler(service)

    const result = await handle({ prompt: 'Prompt' })
    expect(result).toEqual({
      ok: false,
      error: {
        code: 'MODEL_NOT_FOUND',
        message: 'O modelo configurado não está instalado.',
      },
    })
    expect(result).not.toHaveProperty('error.stack')
  })

  it('converte erros desconhecidos para o contrato seguro', async () => {
    const service = {
      generate: vi.fn().mockRejectedValue(new Error('detalhe interno')),
    }
    const handle = createAiGenerateHandler(service)

    await expect(handle({ prompt: 'Prompt' })).resolves.toEqual({
      ok: false,
      error: {
        code: 'UNEXPECTED_ERROR',
        message: 'Ocorreu um erro inesperado ao processar a solicitação.',
      },
    })
  })
})
