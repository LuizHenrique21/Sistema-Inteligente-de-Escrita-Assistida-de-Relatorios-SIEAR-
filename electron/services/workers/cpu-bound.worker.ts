import { parentPort, workerData } from 'node:worker_threads'
import { performance } from 'node:perf_hooks'
import { DocxExtractor } from '../documents/docx-extractor.service'
import { FormattingAnalysisService } from '../documents/formatting-analysis.service'
import { DocumentRenderer } from '../documents/document-renderer'
import type {
  DocxExtractionWorkerInput,
  DocxRenderWorkerInput,
  FormattingAnalysisWorkerInput,
  DiagnosticDelayWorkerInput,
  CpuWorkerRequest,
  CpuWorkerResponse,
  CpuWorkerOutputByType,
  CpuWorkerTaskType,
} from './cpu-bound-worker.types'

async function run(request: CpuWorkerRequest): Promise<unknown> {
  if (request.type === 'diagnostic-delay') {
    const input = request.input as DiagnosticDelayWorkerInput
    if (input.fail) throw new Error('Diagnostic worker failure')
    const payloadBytes = input.payloadBytes ?? 0
    const payload = payloadBytes > 0 ? new Uint8Array(payloadBytes) : null
    if (payload) {
      for (let index = 0; index < payload.length; index += 1)
        payload[index] = index % 251
    }
    if (input.delayMs > 0)
      await new Promise((resolve) => setTimeout(resolve, input.delayMs))
    const checksum = payload
      ? payload.reduce((total, value) => (total + value) % 65_535, 0)
      : 0
    return { payloadBytes, checksum }
  }
  if (request.type === 'docx-extraction') {
    const input = request.input as DocxExtractionWorkerInput
    return new DocxExtractor({ limits: input.limits, useWorker: false }).extract(
      input.filePath,
    )
  }
  if (request.type === 'formatting-analysis') {
    const input = request.input as FormattingAnalysisWorkerInput
    return new FormattingAnalysisService({ useWorker: false }).analyze(
      input.document,
    )
  }
  if (request.type === 'docx-render') {
    const input = request.input as DocxRenderWorkerInput
    const buffer = await new DocumentRenderer({ useWorker: false }).render(
      input.report,
      input.template,
    )
    return buffer.buffer.slice(
      buffer.byteOffset,
      buffer.byteOffset + buffer.byteLength,
    )
  }
  throw new Error(`Tipo de worker CPU-bound desconhecido: ${request.type}`)
}

void (async () => {
  const request = workerData as CpuWorkerRequest
  const startedAt = performance.now()
  try {
    const output = await run(request)
    const finishedAt = performance.now()
    parentPort?.postMessage({
      requestId: request.requestId,
      ok: true,
      output: output as CpuWorkerOutputByType[CpuWorkerTaskType],
      metrics: {
        requestId: request.requestId,
        type: request.type as CpuWorkerTaskType,
        queuedAt: request.queuedAt,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        workerMemoryRssBytes: process.memoryUsage().rss,
      },
    } satisfies CpuWorkerResponse)
  } catch (error) {
    const finishedAt = performance.now()
    parentPort?.postMessage({
      requestId: request.requestId,
      ok: false,
      error: {
        name: error instanceof Error ? error.name : 'Error',
        message: error instanceof Error ? error.message : String(error),
        code:
          typeof error === 'object' && error !== null && 'code' in error
            ? String((error as { code: unknown }).code)
            : undefined,
      },
      metrics: {
        requestId: request.requestId,
        type: request.type as CpuWorkerTaskType,
        queuedAt: request.queuedAt,
        startedAt,
        finishedAt,
        durationMs: finishedAt - startedAt,
        workerMemoryRssBytes: process.memoryUsage().rss,
      },
    } satisfies CpuWorkerResponse)
  }
})()
