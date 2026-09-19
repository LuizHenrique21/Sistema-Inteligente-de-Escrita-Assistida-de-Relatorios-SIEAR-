import { randomUUID } from 'node:crypto'

const DEFAULT_CONCURRENCY = 1
const DEFAULT_MAX_QUEUE_SIZE = 100

export type OllamaInferencePriority = 'low' | 'normal' | 'high'

export interface OllamaInferenceTask {
  requestId: string
  type: string
  priority: OllamaInferencePriority
  prompt: string
  configuration: Record<string, unknown>
  signal: AbortSignal
  enqueuedAt: number
  startedAt: number | null
  finishedAt: number | null
}

export interface OllamaInferenceMetrics {
  queued: number
  running: number
  completed: number
  failed: number
  canceled: number
  timedOut: number
  rejected: number
  maxQueueSize: number
  concurrency: number
  lastWaitMs: number | null
  lastDurationMs: number | null
}

export interface OllamaInferenceCoordinatorOptions {
  concurrency?: number
  maxQueueSize?: number
  now?: () => number
}

export interface OllamaInferenceRunOptions {
  requestId?: string
  type: string
  priority?: OllamaInferencePriority
  prompt: string
  configuration: Record<string, unknown>
  timeoutMs: number
  signal?: AbortSignal
}

interface QueueEntry<T> {
  sequence: number
  task: OllamaInferenceTask
  operation: (signal: AbortSignal) => Promise<T>
  resolve: (value: T) => void
  reject: (reason: unknown) => void
  timeoutCleanup: () => void
  externalCleanup: () => void
}

export class OllamaInferenceBackpressureError extends Error {
  readonly code = 'OLLAMA_QUEUE_FULL' as const

  constructor(message = 'A fila local do Ollama está cheia.') {
    super(message)
    this.name = 'OllamaInferenceBackpressureError'
  }
}

function normalizedConcurrency(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value > 0
    ? value
    : DEFAULT_CONCURRENCY
}

function normalizedMaxQueueSize(value: number | undefined): number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 0
    ? value
    : DEFAULT_MAX_QUEUE_SIZE
}

function priorityWeight(priority: OllamaInferencePriority): number {
  if (priority === 'high') return 2
  if (priority === 'normal') return 1
  return 0
}

function abortError(message: string): DOMException {
  return new DOMException(message, 'AbortError')
}

export class OllamaInferenceCoordinator {
  private readonly concurrency: number
  private readonly maxQueueSize: number
  private readonly now: () => number
  private sequence = 0
  private readonly queue: QueueEntry<unknown>[] = []
  private readonly running = new Set<QueueEntry<unknown>>()
  private readonly metrics: OllamaInferenceMetrics

  constructor(options: OllamaInferenceCoordinatorOptions = {}) {
    this.concurrency = normalizedConcurrency(options.concurrency)
    this.maxQueueSize = normalizedMaxQueueSize(options.maxQueueSize)
    this.now = options.now ?? (() => performance.now())
    this.metrics = {
      queued: 0,
      running: 0,
      completed: 0,
      failed: 0,
      canceled: 0,
      timedOut: 0,
      rejected: 0,
      maxQueueSize: this.maxQueueSize,
      concurrency: this.concurrency,
      lastWaitMs: null,
      lastDurationMs: null,
    }
  }

  getMetrics(): OllamaInferenceMetrics {
    return {
      ...this.metrics,
      queued: this.queue.length,
      running: this.running.size,
    }
  }

  isIdle(): boolean {
    return this.queue.length === 0 && this.running.size === 0
  }

  run<T>(
    options: OllamaInferenceRunOptions,
    operation: (signal: AbortSignal) => Promise<T>,
  ): Promise<T> {
    if (this.queue.length >= this.maxQueueSize) {
      this.metrics.rejected += 1
      return Promise.reject(new OllamaInferenceBackpressureError())
    }

    const timeoutSignal = AbortSignal.timeout(options.timeoutMs)
    const externalSignal = options.signal
    const controller = new AbortController()
    const abortFromExternal = (): void => {
      this.metrics.canceled += 1
      controller.abort(externalSignal?.reason ?? abortError('Inferência cancelada.'))
    }
    const abortFromTimeout = (): void => {
      this.metrics.timedOut += 1
      controller.abort(timeoutSignal.reason ?? abortError('Inferência expirada.'))
    }
    const timeoutCleanup = (): void =>
      timeoutSignal.removeEventListener('abort', abortFromTimeout)
    const externalCleanup = (): void =>
      externalSignal?.removeEventListener('abort', abortFromExternal)

    if (externalSignal?.aborted) {
      externalCleanup()
      timeoutCleanup()
      this.metrics.canceled += 1
      return Promise.reject(externalSignal.reason ?? abortError('Inferência cancelada.'))
    }
    if (timeoutSignal.aborted) {
      externalCleanup()
      timeoutCleanup()
      this.metrics.timedOut += 1
      return Promise.reject(timeoutSignal.reason ?? abortError('Inferência expirada.'))
    }

    timeoutSignal.addEventListener('abort', abortFromTimeout, { once: true })
    externalSignal?.addEventListener('abort', abortFromExternal, { once: true })

    return new Promise<T>((resolve, reject) => {
      const task: OllamaInferenceTask = {
        requestId: options.requestId ?? randomUUID(),
        type: options.type,
        priority: options.priority ?? 'normal',
        prompt: options.prompt,
        configuration: structuredClone(options.configuration),
        signal: controller.signal,
        enqueuedAt: this.now(),
        startedAt: null,
        finishedAt: null,
      }
      const entry: QueueEntry<unknown> = {
        sequence: this.sequence,
        task,
        operation: operation as (signal: AbortSignal) => Promise<unknown>,
        resolve: resolve as (value: unknown) => void,
        reject,
        timeoutCleanup,
        externalCleanup,
      }
      this.sequence += 1
      controller.signal.addEventListener(
        'abort',
        () => {
          if (this.removeQueued(entry)) {
            task.finishedAt = this.now()
            timeoutCleanup()
            externalCleanup()
            reject(controller.signal.reason ?? abortError('Inferência cancelada.'))
            this.drain()
          }
        },
        { once: true },
      )
      this.queue.push(entry)
      this.queue.sort(
        (left, right) =>
          priorityWeight(right.task.priority) -
            priorityWeight(left.task.priority) || left.sequence - right.sequence,
      )
      this.drain()
    })
  }

  private drain(): void {
    while (this.running.size < this.concurrency && this.queue.length > 0) {
      const entry = this.queue.shift()
      if (entry) this.start(entry)
    }
  }

  private start(entry: QueueEntry<unknown>): void {
    entry.task.startedAt = this.now()
    this.metrics.lastWaitMs = entry.task.startedAt - entry.task.enqueuedAt
    this.running.add(entry)
    void this.execute(entry)
  }

  private async execute(entry: QueueEntry<unknown>): Promise<void> {
    try {
      const value = await entry.operation(entry.task.signal)
      this.metrics.completed += 1
      this.finish(entry)
      entry.resolve(value)
    } catch (error: unknown) {
      if (entry.task.signal.aborted) {
        if (!this.isAbortName(error)) this.metrics.canceled += 1
      } else {
        this.metrics.failed += 1
      }
      this.finish(entry)
      entry.reject(error)
    }
  }

  private finish(entry: QueueEntry<unknown>): void {
    entry.task.finishedAt = this.now()
    if (entry.task.startedAt !== null)
      this.metrics.lastDurationMs = entry.task.finishedAt - entry.task.startedAt
    entry.timeoutCleanup()
    entry.externalCleanup()
    this.running.delete(entry)
    this.drain()
  }

  private removeQueued(entry: QueueEntry<unknown>): boolean {
    const index = this.queue.indexOf(entry)
    if (index === -1) return false
    this.queue.splice(index, 1)
    return true
  }

  private isAbortName(error: unknown): boolean {
    return (
      error instanceof Error &&
      (error.name === 'AbortError' || error.name === 'TimeoutError')
    )
  }
}

export function createOllamaInferenceCoordinator(
  options: OllamaInferenceCoordinatorOptions = {},
): OllamaInferenceCoordinator {
  return new OllamaInferenceCoordinator(options)
}

export const defaultOllamaInferenceCoordinator =
  createOllamaInferenceCoordinator()
