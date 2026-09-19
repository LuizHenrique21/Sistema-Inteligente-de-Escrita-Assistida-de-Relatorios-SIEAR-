import { describe, expect, it } from 'vitest'
import { sanitizeLogMetadata, serializeError } from './log-sanitizer'
import { StructuredLogger, runWithLogContext } from './logger'
import type { LogEntry, LogTransport } from './logger.types'
import { withIpcLogging } from './ipc-logging'

function capture(level: 'debug' | 'info' | 'warn' | 'error' = 'debug') {
  const entries: LogEntry[] = []
  const transport: LogTransport = { write: (entry) => entries.push(entry) }
  return {
    entries,
    logger: new StructuredLogger(
      transport,
      level,
      {},
      () => '2026-08-23T00:00:00.000Z',
    ),
  }
}

describe('infraestrutura de logging', () => {
  it('registra debug, info, warn e error com timestamp e metadata', () => {
    const { entries, logger } = capture()
    logger.debug('debug', { value: 1 })
    logger.info('info')
    logger.warn('warn')
    logger.error('error')
    expect(entries.map((entry) => entry.level)).toEqual([
      'debug',
      'info',
      'warn',
      'error',
    ])
    expect(entries[0]).toMatchObject({
      timestamp: '2026-08-23T00:00:00.000Z',
      message: 'debug',
      metadata: { value: 1 },
    })
  })

  it('filtra entradas abaixo do nível configurado', () => {
    const { entries, logger } = capture('warn')
    logger.debug('ignored')
    logger.info('ignored')
    logger.warn('kept')
    expect(entries.map((entry) => entry.message)).toEqual(['kept'])
  })

  it('combina child logger com requestId e correlationId ambientes', () => {
    const { entries, logger } = capture()
    runWithLogContext(
      { requestId: 'request-1', correlationId: 'correlation-1' },
      () =>
        logger
          .child({ context: 'Service', operation: 'create' })
          .info('created'),
    )
    expect(entries[0]?.metadata).toMatchObject({
      context: 'Service',
      operation: 'create',
      requestId: 'request-1',
      correlationId: 'correlation-1',
    })
  })

  it('mede duração de operações', () => {
    const { entries, logger } = capture()
    logger.startTimer('analysis').end()
    expect(entries.at(-1)?.metadata).toMatchObject({
      operation: 'analysis',
      durationMs: expect.any(Number),
    })
  })

  it('serializa erros com código e stack somente como metadata local', () => {
    const error = Object.assign(new Error('falha'), { code: 'ANALYSIS_ERROR' })
    expect(serializeError(error)).toMatchObject({
      name: 'Error',
      message: 'falha',
      code: 'ANALYSIS_ERROR',
      stack: expect.any(String),
    })
  })

  it('remove secrets e conteúdo em objetos aninhados', () => {
    const metadata = sanitizeLogMetadata({
      password: 'senha',
      token: 'sensitive-token-value',
      apiKey: 'sensitive-api-key-value',
      authorization: 'sensitive-bearer-value',
      nested: {
        secret: 'sensitive-secret-value',
        prompt: 'documento completo',
        response: 'resposta',
        content: 'conteúdo',
        safe: 10,
      },
    })
    const serialized = JSON.stringify(metadata)
    for (const secret of [
      'senha',
      'sensitive-token-value',
      'sensitive-api-key-value',
      'sensitive-bearer-value',
      'sensitive-secret-value',
      'documento completo',
      'resposta',
      'conteúdo',
    ])
      expect(serialized).not.toContain(secret)
    expect(metadata).toMatchObject({
      password: '[REDACTED]',
      nested: { safe: 10 },
    })
  })

  it('mantém o mesmo requestId do IPC no handler e nas camadas internas', async () => {
    const { entries, logger } = capture()
    const serviceLogger = logger.child({ context: 'Service' })
    const pipelineLogger = logger.child({ context: 'Pipeline' })
    const handler = withIpcLogging(
      'templates:create',
      logger,
      async () => {
        serviceLogger.info('service called')
        await Promise.resolve()
        pipelineLogger.info('pipeline called')
        return 'ok'
      },
      () => 'request-fixed',
    )
    await expect(handler()).resolves.toBe('ok')
    const operationEntries = entries.filter((entry) =>
      ['service called', 'pipeline called'].includes(entry.message),
    )
    expect(operationEntries).toHaveLength(2)
    expect(
      operationEntries.every(
        (entry) => entry.metadata.requestId === 'request-fixed',
      ),
    ).toBe(true)
    expect(
      operationEntries.every(
        (entry) => entry.metadata.correlationId === 'request-fixed',
      ),
    ).toBe(true)
  })

  it('registra falha IPC e relança o erro', async () => {
    const { entries, logger } = capture()
    const handler = withIpcLogging(
      'channel',
      logger,
      () => {
        throw new Error('boom')
      },
      () => 'request',
    )
    await expect(handler()).rejects.toThrow('boom')
    expect(entries.at(-1)).toMatchObject({
      level: 'error',
      message: 'IPC request failed',
    })
  })

  it('registra erro controlado sem expor sua mensagem', async () => {
    const { entries, logger } = capture()
    const handler = withIpcLogging(
      'templates:create',
      logger,
      async () => ({
        success: false as const,
        error: { code: 'INVALID_RESPONSE', message: 'conteudo-confidencial' },
      }),
      () => 'request-controlled',
    )

    await handler()

    const failure = entries.find(
      (entry) => entry.message === 'IPC request returned controlled failure',
    )
    expect(failure).toMatchObject({
      level: 'error',
      metadata: {
        requestId: 'request-controlled',
        errorCode: 'INVALID_RESPONSE',
      },
    })
    expect(JSON.stringify(failure)).not.toContain('conteudo-confidencial')
  })
})
