import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'
import { afterEach, describe, expect, it } from 'vitest'
import { runCpuWorkerTask } from './cpu-bound-worker.host'
import type {
  DocumentRepresentation,
  ParagraphFormatting,
} from '../documents/types'

const formatting: ParagraphFormatting = {
  fontFamily: 'Arial',
  fontSizePt: 11,
  bold: false,
  italic: false,
  underline: false,
  alignment: 'justify',
  lineSpacing: 1.15,
  spaceBeforePt: 0,
  spaceAfterPt: 6,
  indentLeftPt: 0,
  indentRightPt: 0,
  firstLineIndentPt: 18,
  styleId: 'Normal',
}

function document(): DocumentRepresentation {
  return {
    fileName: 'modelo.docx',
    fileType: 'docx',
    text: 'Texto tecnico.',
    metadata: {
      fileSize: 100,
      extractedAt: '2026-08-24T00:00:00.000Z',
      title: null,
      author: null,
      createdAt: null,
      modifiedAt: null,
    },
    elements: [],
    paragraphs: [
      {
        id: 'p1',
        text: 'Texto tecnico.',
        order: 1,
        style: 'paragraph',
        headingLevel: null,
        sectionId: null,
        numbering: null,
        formatting,
        pageBreakBefore: false,
      },
    ],
    sections: [],
    headings: [],
    lists: [],
    tables: [],
    figures: [],
    headers: [],
    footers: [],
    pageInformation: {
      widthPt: 612,
      heightPt: 792,
      orientation: 'portrait',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
      pageBreakCount: 0,
      hasPageNumbering: false,
    },
    formatting: { defaultParagraph: formatting },
    styles: [
      {
        id: 'Normal',
        name: 'Normal',
        type: 'paragraph',
        basedOn: null,
        isDefault: true,
        formatting,
      },
    ],
  }
}

describe('CpuBoundWorkerHost', () => {
  const originalConcurrency = process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY
  const tempDirectories: string[] = []

  afterEach(async () => {
    if (originalConcurrency === undefined)
      delete process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY
    else process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY = originalConcurrency
    await Promise.all(
      tempDirectories.splice(0).map((directory) =>
        rm(directory, { recursive: true, force: true }),
      ),
    )
  })

  async function workerFixture(source: string): Promise<URL> {
    const directory = await mkdtemp(path.join(os.tmpdir(), 'siear-worker-test-'))
    tempDirectories.push(directory)
    const file = path.join(directory, 'worker.mjs')
    await writeFile(file, source)
    return pathToFileURL(file)
  }

  it('mede tempo, memoria e atraso do event loop', async () => {
    const delay = monitorEventLoopDelay({ resolution: 10 })
    delay.enable()
    const result = await runCpuWorkerTask('formatting-analysis', {
      document: document(),
    })
    delay.disable()

    expect(result.value.documentStyle.predominantFont).toBe('Arial')
    expect(result.metrics.durationMs).toBeGreaterThanOrEqual(0)
    expect(result.metrics.workerMemoryRssBytes).toBeGreaterThan(0)
    expect(result.metrics.hostRoundTripMs).toBeGreaterThanOrEqual(
      result.metrics.durationMs,
    )
    expect(Number.isFinite(delay.mean)).toBe(true)
  })

  it('cancela antes de iniciar quando AbortSignal ja esta abortado', async () => {
    const controller = new AbortController()
    controller.abort()

    await expect(
      runCpuWorkerTask(
        'formatting-analysis',
        { document: document() },
        { signal: controller.signal },
      ),
    ).rejects.toMatchObject({ code: 'CPU_WORKER_CANCELLED' })
  })

  it('cancela uma operacao ja iniciada sem contaminar chamadas seguintes', async () => {
    const controller = new AbortController()
    const running = runCpuWorkerTask(
      'diagnostic-delay',
      { delayMs: 300, payloadBytes: 1024 },
      { signal: controller.signal },
    )
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()

    await expect(running).rejects.toMatchObject({
      code: 'CPU_WORKER_CANCELLED',
    })
    await expect(
      runCpuWorkerTask('diagnostic-delay', { delayMs: 1 }),
    ).resolves.toMatchObject({ value: { payloadBytes: 0 } })
  })

  it('aplica timeout real sem contaminar chamadas seguintes', async () => {
    await expect(
      runCpuWorkerTask(
        'diagnostic-delay',
        { delayMs: 300, payloadBytes: 1024 },
        { timeoutMs: 25 },
      ),
    ).rejects.toMatchObject({ code: 'CPU_WORKER_TIMEOUT' })

    await expect(
      runCpuWorkerTask('formatting-analysis', { document: document() }),
    ).resolves.toMatchObject({
      value: { documentStyle: { predominantFont: 'Arial' } },
    })
  })

  it('isola falha durante execucao do worker', async () => {
    await expect(
      runCpuWorkerTask('diagnostic-delay', { delayMs: 1, fail: true }),
    ).rejects.toThrow('Diagnostic worker failure')

    await expect(
      runCpuWorkerTask('diagnostic-delay', { delayMs: 1 }),
    ).resolves.toMatchObject({ value: { checksum: 0 } })
  })

  it('rejeita encerramento inesperado do worker', async () => {
    const workerUrl = await workerFixture('process.exit(42)')

    await expect(
      runCpuWorkerTask(
        'diagnostic-delay',
        { delayMs: 1 },
        { workerUrlOverride: workerUrl },
      ),
    ).rejects.toThrow('codigo 42')
  })

  it('rejeita mensagem invalida do worker', async () => {
    const workerUrl = await workerFixture(`
      import { parentPort } from 'node:worker_threads'
      parentPort.postMessage({ ok: true })
    `)

    await expect(
      runCpuWorkerTask(
        'diagnostic-delay',
        { delayMs: 1 },
        { workerUrlOverride: workerUrl },
      ),
    ).rejects.toMatchObject({ code: 'CPU_WORKER_INVALID_RESPONSE' })
  })

  it('respeita concorrencia 1 em multiplas operacoes simultaneas', async () => {
    process.env.SIEAR_CPU_WORKER_MAX_CONCURRENCY = '1'
    const startedAt = performance.now()
    const results = await Promise.all([
      runCpuWorkerTask('diagnostic-delay', { delayMs: 80 }),
      runCpuWorkerTask('diagnostic-delay', { delayMs: 80 }),
      runCpuWorkerTask('diagnostic-delay', { delayMs: 80 }),
    ])
    const totalMs = performance.now() - startedAt

    expect(results).toHaveLength(3)
    expect(totalMs).toBeGreaterThanOrEqual(180)
  })
})
