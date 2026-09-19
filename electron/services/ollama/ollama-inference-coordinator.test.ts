import { describe, expect, it, vi } from 'vitest'
import {
  createOllamaInferenceCoordinator,
  OllamaInferenceBackpressureError,
} from './ollama-inference-coordinator'

function deferred<T>() {
  let resolve!: (value: T) => void
  let reject!: (reason?: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

async function tick(): Promise<void> {
  await Promise.resolve()
}

function taskOptions(index: number, timeoutMs = 10_000) {
  return {
    requestId: `request-${index}`,
    type: 'test',
    priority: 'normal' as const,
    prompt: `Prompt ${index}`,
    configuration: { model: 'qwen3:8b' },
    timeoutMs,
  }
}

describe('OllamaInferenceCoordinator', () => {
  it('executa tarefas FIFO quando a prioridade é igual', async () => {
    const coordinator = createOllamaInferenceCoordinator({ concurrency: 1 })
    const order: number[] = []

    const results = await Promise.all([
      coordinator.run(taskOptions(1), async () => {
        order.push(1)
        return 'a'
      }),
      coordinator.run(taskOptions(2), async () => {
        order.push(2)
        return 'b'
      }),
      coordinator.run(taskOptions(3), async () => {
        order.push(3)
        return 'c'
      }),
    ])

    expect(results).toEqual(['a', 'b', 'c'])
    expect(order).toEqual([1, 2, 3])
    expect(coordinator.isIdle()).toBe(true)
  })

  it('respeita concorrência 1 e não inicia chamadas simultâneas', async () => {
    const coordinator = createOllamaInferenceCoordinator({ concurrency: 1 })
    const first = deferred<string>()
    let active = 0
    let maxActive = 0
    let secondStarted = false

    const firstRun = coordinator.run(taskOptions(1), async () => {
      active += 1
      maxActive = Math.max(maxActive, active)
      const value = await first.promise
      active -= 1
      return value
    })
    const secondRun = coordinator.run(taskOptions(2), async () => {
      secondStarted = true
      active += 1
      maxActive = Math.max(maxActive, active)
      active -= 1
      return 'second'
    })

    await tick()
    expect(secondStarted).toBe(false)
    first.resolve('first')

    await expect(Promise.all([firstRun, secondRun])).resolves.toEqual([
      'first',
      'second',
    ])
    expect(maxActive).toBe(1)
  })

  it('ordena múltiplas requisições por prioridade sem quebrar FIFO interno', async () => {
    const coordinator = createOllamaInferenceCoordinator({ concurrency: 1 })
    const blocker = deferred<string>()
    const order: string[] = []

    const running = coordinator.run(taskOptions(0), async () => {
      order.push('running')
      return blocker.promise
    })
    const low = coordinator.run(
      { ...taskOptions(1), priority: 'low' },
      async () => {
        order.push('low')
        return 'low'
      },
    )
    const highA = coordinator.run(
      { ...taskOptions(2), priority: 'high' },
      async () => {
        order.push('high-a')
        return 'high-a'
      },
    )
    const highB = coordinator.run(
      { ...taskOptions(3), priority: 'high' },
      async () => {
        order.push('high-b')
        return 'high-b'
      },
    )

    await tick()
    blocker.resolve('running')

    await expect(Promise.all([running, low, highA, highB])).resolves.toEqual([
      'running',
      'low',
      'high-a',
      'high-b',
    ])
    expect(order).toEqual(['running', 'high-a', 'high-b', 'low'])
  })

  it('aplica timeout e libera a próxima tarefa', async () => {
    const coordinator = createOllamaInferenceCoordinator({ concurrency: 1 })
    const timedOut = coordinator.run(taskOptions(1, 1), () => new Promise(
      (_resolve, reject) => {
        setTimeout(() => reject(new DOMException('Timeout', 'TimeoutError')), 5)
      },
    ))
    const next = coordinator.run(taskOptions(2), async () => 'ok')

    await expect(timedOut).rejects.toThrow()
    await expect(next).resolves.toBe('ok')
    expect(coordinator.getMetrics()).toMatchObject({
      timedOut: 1,
      completed: 1,
    })
  })

  it('cancela tarefa aguardando na fila sem duplicar execução', async () => {
    const coordinator = createOllamaInferenceCoordinator({ concurrency: 1 })
    const blocker = deferred<string>()
    const controller = new AbortController()
    const operation = vi.fn().mockResolvedValue('never')

    const running = coordinator.run(taskOptions(1), () => blocker.promise)
    const queued = coordinator.run(
      { ...taskOptions(2), signal: controller.signal },
      operation,
    )

    controller.abort(new DOMException('Cancelado', 'AbortError'))
    await expect(queued).rejects.toThrow()
    blocker.resolve('done')
    await expect(running).resolves.toBe('done')

    expect(operation).not.toHaveBeenCalled()
    expect(coordinator.getMetrics().canceled).toBe(1)
  })

  it('mantém a fila saudável quando uma requisição falha', async () => {
    const coordinator = createOllamaInferenceCoordinator({ concurrency: 1 })
    const failure = new Error('falha isolada')

    const first = coordinator.run(taskOptions(1), async () => {
      throw failure
    })
    const second = coordinator.run(taskOptions(2), async () => 'ok')

    await expect(first).rejects.toBe(failure)
    await expect(second).resolves.toBe('ok')
    expect(coordinator.getMetrics()).toMatchObject({
      failed: 1,
      completed: 1,
    })
  })

  it('reporta métricas e fila vazia', async () => {
    let now = 100
    const coordinator = createOllamaInferenceCoordinator({
      concurrency: 1,
      now: () => now,
    })
    const blocker = deferred<string>()
    const first = coordinator.run(taskOptions(1), async () => {
      now = 130
      return blocker.promise
    })
    const second = coordinator.run(taskOptions(2), async () => {
      now = 180
      return 'second'
    })

    await tick()
    expect(coordinator.getMetrics()).toMatchObject({
      queued: 1,
      running: 1,
      concurrency: 1,
    })
    now = 160
    blocker.resolve('first')

    await expect(Promise.all([first, second])).resolves.toEqual([
      'first',
      'second',
    ])
    expect(coordinator.isIdle()).toBe(true)
    expect(coordinator.getMetrics()).toMatchObject({
      queued: 0,
      running: 0,
      completed: 2,
      lastWaitMs: 30,
      lastDurationMs: 20,
    })
  })

  it('rejeita carga acima do limite de fila com backpressure', async () => {
    const coordinator = createOllamaInferenceCoordinator({
      concurrency: 1,
      maxQueueSize: 2,
    })
    const blocker = deferred<string>()

    const running = coordinator.run(taskOptions(1), () => blocker.promise)
    const queuedA = coordinator.run(taskOptions(2), async () => 'a')
    const queuedB = coordinator.run(taskOptions(3), async () => 'b')
    const rejected = coordinator.run(taskOptions(4), async () => 'c')

    await expect(rejected).rejects.toBeInstanceOf(
      OllamaInferenceBackpressureError,
    )
    blocker.resolve('running')
    await expect(Promise.all([running, queuedA, queuedB])).resolves.toEqual([
      'running',
      'a',
      'b',
    ])
    expect(coordinator.getMetrics().rejected).toBe(1)
  })
})
