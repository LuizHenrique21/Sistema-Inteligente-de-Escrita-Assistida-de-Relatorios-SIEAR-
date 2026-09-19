import { randomUUID } from 'node:crypto'
import { mkdir } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { Worker } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { DocumentExtractionError } from '../documents/document-errors'
import { resolveCpuWorkerPolicy } from './cpu-worker-policy'
import type {
  CpuWorkerInputByType,
  CpuWorkerFailure,
  CpuWorkerMetrics,
  CpuWorkerOutputByType,
  CpuWorkerRequest,
  CpuWorkerResponse,
  CpuWorkerRunOptions,
  CpuWorkerTaskType,
} from './cpu-bound-worker.types'

export class CpuWorkerTimeoutError extends Error {
  public readonly code = 'CPU_WORKER_TIMEOUT'

  constructor(message: string) {
    super(message)
    this.name = 'CpuWorkerTimeoutError'
  }
}

export class CpuWorkerCancelledError extends Error {
  public readonly code = 'CPU_WORKER_CANCELLED'

  constructor(message: string) {
    super(message)
    this.name = 'CpuWorkerCancelledError'
  }
}

let bundledWorkerUrl: URL | null = null
let activeWorkers = 0
const workerQueue: Array<{
  resolve: () => void
  reject: (error: Error) => void
  signal?: AbortSignal
  onAbort: () => void
}> = []

function isBuiltElectronFile(): boolean {
  return fileURLToPath(import.meta.url)
    .split(path.sep)
    .includes('dist-electron')
}

async function workerUrl(): Promise<URL> {
  if (isBuiltElectronFile())
    return new URL('./cpu-bound.worker.mjs', import.meta.url)
  const workerSource = './cpu-bound.worker.ts'
  const source = new URL(workerSource, import.meta.url)
  if (!source.pathname.endsWith('.ts')) return source
  if (bundledWorkerUrl) return bundledWorkerUrl

  const vite = await import(/* @vite-ignore */ 'vite')
  const directory = path.join(os.tmpdir(), 'siear-cpu-workers')
  await mkdir(directory, { recursive: true })
  const result = await vite.build({
    configFile: false,
    logLevel: 'silent',
    plugins: [
      {
        name: 'siear-worker-logger-stub',
        enforce: 'pre',
        resolveId(id) {
          if (id.includes('logger.runtime'))
            return '\0siear-worker-logger-stub'
          if (id.includes('electron-log.transport'))
            return '\0siear-worker-electron-log-transport-stub'
          if (id.includes('cpu-bound-worker.host'))
            return '\0siear-worker-host-stub'
          return null
        },
        load(id) {
          if (id === '\0siear-worker-logger-stub')
            return `export function getLogger() {
              return {
                info: () => undefined,
                warn: () => undefined,
                error: () => undefined,
                debug: () => undefined,
                startTimer: () => ({ end: () => undefined }),
              }
            }`
          if (id === '\0siear-worker-electron-log-transport-stub')
            return `export class ElectronLogTransport { write() {} }
              export function configureElectronLog() {}`
          if (id === '\0siear-worker-host-stub')
            return `export async function runCpuWorkerTask() {
              throw new Error('CPU worker host is not available inside CPU workers.')
            }`
          return null
        },
      },
    ],
    ssr: {
      noExternal: true,
    },
    build: {
      ssr: fileURLToPath(source),
      outDir: directory,
      emptyOutDir: false,
      rollupOptions: {
        output: {
          entryFileNames: 'cpu-bound.worker.mjs',
          format: 'esm',
          banner:
            "import { fileURLToPath as __siearFileURLToPath } from 'node:url'; import { dirname as __siearDirname } from 'node:path'; const __filename = __siearFileURLToPath(import.meta.url); const __dirname = __siearDirname(__filename);",
        },
      },
    },
  })
  const outputs = Array.isArray(result) ? result : [result]
  await Promise.all(
    outputs.map((item) =>
      'close' in item && typeof item.close === 'function'
        ? item.close()
        : Promise.resolve(),
    ),
  )
  const outfile = path.join(directory, 'cpu-bound.worker.mjs')
  bundledWorkerUrl = pathToFileURL(outfile)
  return bundledWorkerUrl
}

function releaseWorkerSlot(): void {
  activeWorkers = Math.max(0, activeWorkers - 1)
  const next = workerQueue.shift()
  if (!next) return
  next.signal?.removeEventListener('abort', next.onAbort)
  activeWorkers += 1
  next.resolve()
}

function acquireWorkerSlot(signal?: AbortSignal): Promise<void> {
  if (signal?.aborted)
    return Promise.reject(
      new CpuWorkerCancelledError('Tarefa CPU-bound cancelada na fila.'),
    )
  const maxConcurrentWorkers = resolveCpuWorkerPolicy().maxConcurrentWorkers
  if (activeWorkers < maxConcurrentWorkers) {
    activeWorkers += 1
    return Promise.resolve()
  }
  return new Promise((resolve, reject) => {
    const entry = {
      resolve,
      reject,
      signal,
      onAbort: () => {
        const index = workerQueue.indexOf(entry)
        if (index >= 0) workerQueue.splice(index, 1)
        reject(new CpuWorkerCancelledError('Tarefa CPU-bound cancelada na fila.'))
      },
    }
    signal?.addEventListener('abort', entry.onAbort, { once: true })
    workerQueue.push(entry)
  })
}

function deserializeError(error: CpuWorkerFailure['error']): Error {
  if (error?.code === 'DOCX_LIMIT_EXCEEDED' || error?.code === 'EMPTY_DOCUMENT')
    return new DocumentExtractionError(
      error.code,
      error.message,
    )
  const result = new Error(error?.message ?? 'Worker CPU-bound falhou.')
  result.name = error?.name ?? 'CpuWorkerError'
  if (error?.code) (result as Error & { code?: string }).code = error.code
  return result
}

function invalidWorkerResponseError(): Error {
  const error = new Error('Worker CPU-bound retornou mensagem invalida.')
  error.name = 'CpuWorkerProtocolError'
  ;(error as Error & { code?: string }).code = 'CPU_WORKER_INVALID_RESPONSE'
  return error
}

export async function runCpuWorkerTask<T extends CpuWorkerTaskType>(
  type: T,
  input: CpuWorkerInputByType[T],
  options: CpuWorkerRunOptions = {},
): Promise<{ value: CpuWorkerOutputByType[T]; metrics: CpuWorkerMetrics }> {
  const requestId = options.requestId ?? randomUUID()
  if (options.signal?.aborted)
    throw new CpuWorkerCancelledError(
      `Tarefa CPU-bound ${requestId} cancelada antes de iniciar.`,
    )

  const request: CpuWorkerRequest<T> = {
    requestId,
    type,
    input,
    queuedAt: performance.now(),
  }
  await acquireWorkerSlot(options.signal)
  const workerUrlStartedAt = performance.now()
  let resolvedWorkerUrl: URL
  let workerUrlResolvedAt: number
  let worker: Worker
  try {
    resolvedWorkerUrl = options.workerUrlOverride ?? (await workerUrl())
    workerUrlResolvedAt = performance.now()
    worker = new Worker(resolvedWorkerUrl, {
      workerData: request,
      env: { ...process.env, SIEAR_CPU_WORKER: '1' },
    })
  } catch (error) {
    releaseWorkerSlot()
    throw error
  }
  const workerConstructedAt = performance.now()

  let settled = false
  let timeout: NodeJS.Timeout | null = null
  const terminate = async (): Promise<void> => {
    try {
      await worker.terminate()
    } catch {
      // Worker termination is best-effort after abort/timeout.
    }
  }

  return new Promise((resolve, reject) => {
    const finish = (
      callback: () => void,
      terminateWorker = false,
    ): void => {
      if (settled) return
      settled = true
      if (timeout) clearTimeout(timeout)
      options.signal?.removeEventListener('abort', onAbort)
      if (terminateWorker) void terminate()
      releaseWorkerSlot()
      callback()
    }
    const onAbort = (): void =>
      finish(
        () =>
          reject(
            new CpuWorkerCancelledError(
              `Tarefa CPU-bound ${requestId} cancelada.`,
            ),
          ),
        true,
      )

    options.signal?.addEventListener('abort', onAbort, { once: true })
    if (options.timeoutMs && options.timeoutMs > 0) {
      timeout = setTimeout(
        () =>
          finish(
            () =>
              reject(
                new CpuWorkerTimeoutError(
                  `Tarefa CPU-bound ${requestId} excedeu ${options.timeoutMs}ms.`,
                ),
              ),
            true,
          ),
        options.timeoutMs,
      )
    }

    worker.once('message', (response: CpuWorkerResponse<T>) => {
      finish(() => {
        if (
          !response ||
          typeof response !== 'object' ||
          !('ok' in response) ||
          response.requestId !== requestId
        ) {
          reject(invalidWorkerResponseError())
          return
        }
        if (response.ok) {
          if (!response.metrics) {
            reject(invalidWorkerResponseError())
            return
          }
          resolve({
            value: response.output,
            metrics: {
              ...response.metrics,
              workerUrlResolutionMs: workerUrlResolvedAt - workerUrlStartedAt,
              workerStartupMs: response.metrics.startedAt - workerConstructedAt,
              hostRoundTripMs: performance.now() - request.queuedAt,
            },
          })
        } else {
          reject(deserializeError(response.error))
        }
      })
    })
    worker.once('error', (error) => finish(() => reject(error)))
    worker.once('exit', (code) => {
      if (code !== 0)
        finish(
          () => reject(new Error(`Worker CPU-bound encerrou com codigo ${code}.`)),
        )
    })
  })
}
