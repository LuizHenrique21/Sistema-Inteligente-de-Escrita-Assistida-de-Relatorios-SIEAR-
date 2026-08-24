import { describe, expect, it } from 'vitest'
import { BaselineCollector } from './baseline.collector'

describe('BaselineCollector', () => {
  it('registra duração, correlação, tamanhos, heap e resultado', async () => {
    const collector = new BaselineCollector({
      operationId: 'operation-1',
      requestId: 'request-1',
    })
    await expect(
      collector.measure('extraction', async () => 42, {
        inputSizeBytes: 10,
        outputSizeBytes: () => 2,
      }),
    ).resolves.toBe(42)
    expect(collector.stages).toEqual([
      expect.objectContaining({
        operationId: 'operation-1',
        requestId: 'request-1',
        stage: 'extraction',
        name: 'extraction',
        status: 'completed',
        success: true,
        inputSizeBytes: 10,
        outputSizeBytes: 2,
        errorCode: null,
      }),
    ])
    expect(collector.stages[0]?.durationMs).toBeGreaterThanOrEqual(0)
    expect(collector.stages[0]?.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T/)
  })

  it('registra código seguro quando uma etapa falha e relança o erro', async () => {
    const collector = new BaselineCollector()
    const error = Object.assign(new Error('falha'), { code: 'INVALID' })
    await expect(
      collector.measure('writing', async () => Promise.reject(error)),
    ).rejects.toBe(error)
    expect(collector.stages[0]).toMatchObject({
      name: 'writing',
      status: 'failed',
      success: false,
      errorCode: 'INVALID',
    })
  })

  it('não registra conteúdo sensível nem mensagens de erro', async () => {
    const secret = 'CLIENTE-SECRETO-12345'
    const collector = new BaselineCollector()
    const error = Object.assign(new Error(`falha com ${secret}`), {
      code: 'INVALID',
    })

    await expect(
      collector.measure('writing', async () => Promise.reject(error), {
        inputSizeBytes: Buffer.byteLength(secret),
      }),
    ).rejects.toBe(error)

    const serializedMetrics = JSON.stringify(collector.stages)
    expect(serializedMetrics).not.toContain(secret)
    expect(serializedMetrics).not.toContain('falha com')
    expect(collector.stages[0]?.inputSizeBytes).toBeGreaterThan(0)
  })

  it('representa métricas indisponíveis explicitamente com null', () => {
    const collector = new BaselineCollector()
    collector.recordUnavailable('generation', 'not-measured')

    expect(collector.stages[0]).toMatchObject({
      stage: 'generation',
      status: 'not-measured',
      success: null,
      durationMs: null,
      inputSizeBytes: null,
      outputSizeBytes: null,
      heapBeforeBytes: null,
      heapAfterBytes: null,
      heapDeltaBytes: null,
      errorCode: null,
    })
  })
})
