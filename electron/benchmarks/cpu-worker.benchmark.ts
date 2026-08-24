import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import JSZip from 'jszip'
import { afterAll, describe, expect, it } from 'vitest'
import type { ReportTemplate } from '../../src/domain/templates/report-template'
import type {
  GeneratedReport,
  GeneratedReportElement,
} from '../../src/types/generated-report'
import { createRichReportTemplate } from '../testing/report-template.fixture'
import { DocumentRenderer } from '../services/documents/document-renderer'
import { DocxExtractor } from '../services/documents/docx-extractor.service'
import { FormattingAnalysisService } from '../services/documents/formatting-analysis.service'
import type { DocumentRepresentation } from '../services/documents/types'
import { resolveCpuWorkerPolicy } from '../services/workers/cpu-worker-policy'
import { runCpuWorkerTask } from '../services/workers/cpu-bound-worker.host'

type FixtureSize = 'small' | 'medium' | 'large'
type Operation = 'extraction' | 'formatting' | 'rendering'
type Mode = 'main' | 'worker'

interface FixtureProfile {
  id: FixtureSize
  sections: number
  paragraphsPerSection: number
  tables: number
  images: number
}

interface FixtureSummary {
  id: FixtureSize
  filePath: string
  compressedBytes: number
  paragraphs: number
  sections: number
  tables: number
  images: number
  styles: number
  elements: number
}

interface Measurement {
  fixtureId: FixtureSize
  operation: Operation
  mode: Mode
  repetitions: number
  totalDurationMs: number
  averageDurationMs: number
  minDurationMs: number
  maxDurationMs: number
  p50DurationMs: number
  p95DurationMs: number
  heapBeforeBytes: number
  heapAfterBytes: number
  heapPeakObservedBytes: number
  eventLoopMeanDelayMs: number | null
  eventLoopMaxDelayMs: number
  eventLoopP95DelayMs: number
  resultSizeBytes: number
  success: boolean
  error: string | null
}

const repetitions = Math.max(
  2,
  Number(process.env.SIEAR_CPU_WORKER_BENCHMARK_REPETITIONS) || 3,
)
const outputDirectory = path.resolve('benchmark-results', 'cpu-workers')
let tempDirectory: string | null = null

const transparentPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69E1WQAAAABJRU5ErkJggg=='

function generatedReport(profile: FixtureProfile): GeneratedReport {
  return {
    id: `cpu-worker-${profile.id}`,
    templateId: 'cpu-worker-template',
    templateName: 'CPU worker benchmark template',
    createdAt: '2026-08-24T00:00:00.000Z',
    sections: Array.from({ length: profile.sections }, (_, sectionIndex) => {
      const paragraphs = Array.from(
        { length: profile.paragraphsPerSection },
        (_, paragraphIndex) =>
          `Section ${sectionIndex + 1} paragraph ${paragraphIndex + 1} with deterministic technical content for benchmark comparison.`,
      )
      const elements: GeneratedReportElement[] = paragraphs.map((content) => ({
        type: 'paragraph' as const,
        content,
      }))
      if (sectionIndex < profile.tables)
        elements.push({
          type: 'table' as const,
          headerRows: 1,
          rows: [
            ['Metric', 'Value'],
            ['Section', String(sectionIndex + 1)],
            ['Paragraphs', String(profile.paragraphsPerSection)],
          ],
        })
      if (sectionIndex < profile.images)
        elements.push({
          type: 'figure' as const,
          dataBase64: transparentPng,
          contentType: 'image/png' as const,
          fileName: `image-${sectionIndex + 1}.png`,
          caption: `Figure ${sectionIndex + 1}`,
        })
      return {
        id: `section-${sectionIndex + 1}`,
        name: `Section ${sectionIndex + 1}`,
        order: sectionIndex + 1,
        content: paragraphs.join('\n'),
        elements,
      }
    }),
  }
}

function templateFor(profile: FixtureProfile): ReportTemplate {
  const template = createRichReportTemplate('cpu-worker-template')
  template.structurePattern.hierarchy = generatedReport(profile).sections.map(
    (section) => ({
      name: section.name,
      level: 1,
      order: section.order,
      purpose: 'Benchmark section.',
      required: true,
      repeatable: false,
      children: [],
    }),
  )
  template.structurePattern.sections = template.structurePattern.hierarchy
  return template
}

async function createFixture(profile: FixtureProfile): Promise<FixtureSummary> {
  if (!tempDirectory)
    tempDirectory = await mkdtemp(path.join(os.tmpdir(), 'siear-cpu-bench-'))
  const filePath = path.join(tempDirectory, `${profile.id}.docx`)
  const template = templateFor(profile)
  const report = generatedReport(profile)
  const buffer = await new DocumentRenderer({ useWorker: false }).render(
    report,
    template,
  )
  await writeFile(filePath, buffer)
  const extracted = await new DocxExtractor({ useWorker: false }).extract(
    filePath,
  )
  const file = await stat(filePath)
  return {
    id: profile.id,
    filePath,
    compressedBytes: file.size,
    paragraphs: extracted.paragraphs.length,
    sections: extracted.sections.length,
    tables: extracted.tables.length,
    images: extracted.figures.length,
    styles: extracted.styles.length,
    elements: extracted.elements.length,
  }
}

function percentile(values: number[], value: number): number {
  const sorted = [...values].sort((a, b) => a - b)
  const index = Math.min(
    sorted.length - 1,
    Math.ceil((value / 100) * sorted.length) - 1,
  )
  return sorted[Math.max(0, index)] ?? 0
}

function sizeOf(value: unknown): number {
  if (Buffer.isBuffer(value)) return value.length
  if (value instanceof ArrayBuffer) return value.byteLength
  return Buffer.byteLength(JSON.stringify(value))
}

async function measure(
  fixtureId: FixtureSize,
  operation: Operation,
  mode: Mode,
  work: () => Promise<unknown>,
): Promise<Measurement> {
  const durations: number[] = []
  const delay = monitorEventLoopDelay({ resolution: 10 })
  const heapBeforeBytes = process.memoryUsage().heapUsed
  let heapPeakObservedBytes = heapBeforeBytes
  let resultSizeBytes = 0
  let error: string | null = null
  delay.enable()
  for (let index = 0; index < repetitions; index += 1) {
    const startedAt = performance.now()
    try {
      const result = await work()
      resultSizeBytes = sizeOf(result)
    } catch (caught) {
      error = caught instanceof Error ? caught.message : String(caught)
    }
    durations.push(performance.now() - startedAt)
    heapPeakObservedBytes = Math.max(
      heapPeakObservedBytes,
      process.memoryUsage().heapUsed,
    )
  }
  delay.disable()
  const heapAfterBytes = process.memoryUsage().heapUsed
  const totalDurationMs = durations.reduce((total, item) => total + item, 0)
  return {
    fixtureId,
    operation,
    mode,
    repetitions,
    totalDurationMs,
    averageDurationMs: totalDurationMs / durations.length,
    minDurationMs: Math.min(...durations),
    maxDurationMs: Math.max(...durations),
    p50DurationMs: percentile(durations, 50),
    p95DurationMs: percentile(durations, 95),
    heapBeforeBytes,
    heapAfterBytes,
    heapPeakObservedBytes,
    eventLoopMeanDelayMs: Number.isFinite(delay.mean)
      ? delay.mean / 1_000_000
      : null,
    eventLoopMaxDelayMs: delay.max / 1_000_000,
    eventLoopP95DelayMs: delay.percentile(95) / 1_000_000,
    resultSizeBytes,
    success: error === null,
    error,
  }
}

function normalizedDocument(document: DocumentRepresentation): unknown {
  return {
    text: document.text,
    paragraphs: document.paragraphs.map((paragraph) => ({
      text: paragraph.text,
      order: paragraph.order,
      style: paragraph.style,
      headingLevel: paragraph.headingLevel,
      formatting: paragraph.formatting,
      pageBreakBefore: paragraph.pageBreakBefore,
    })),
    sections: document.sections.map((section) => ({
      title: section.title,
      level: section.level,
      order: section.order,
      content: section.content,
    })),
    lists: document.lists.map((list) => ({
      ordered: list.ordered,
      format: list.format,
      items: list.items.map((item) => item.text),
    })),
    tables: document.tables.map((table) => table.rows),
    figures: document.figures.map((figure) => ({
      fileName: figure.fileName,
      contentType: figure.contentType,
      caption: figure.caption,
    })),
    headers: document.headers.map((header) => header.text),
    footers: document.footers.map((footer) => footer.text),
    pageInformation: document.pageInformation,
    styles: document.styles.map((style) => ({
      id: style.id,
      name: style.name,
      type: style.type,
      basedOn: style.basedOn,
      formatting: style.formatting,
    })),
  }
}

async function normalizedDocx(buffer: Buffer): Promise<Record<string, string>> {
  const zip = await JSZip.loadAsync(buffer)
  const result: Record<string, string> = {}
  for (const name of [
    '[Content_Types].xml',
    'word/document.xml',
    'word/styles.xml',
    'word/numbering.xml',
    'word/_rels/document.xml.rels',
  ]) {
    result[name] = await zip.file(name)!.async('text')
  }
  const media = Object.keys(zip.files)
    .filter((name) => name.startsWith('word/media/') && !zip.files[name]?.dir)
    .sort()
  for (const name of media) {
    const data = await zip.file(name)!.async('nodebuffer')
    result[name] = createHash('sha256').update(data).digest('hex')
  }
  return result
}

function recommendThreshold(
  operation: Operation,
  fixtures: FixtureSummary[],
  measurements: Measurement[],
): number | null {
  for (const fixture of fixtures) {
    const main = measurements.find(
      (item) =>
        item.fixtureId === fixture.id &&
        item.operation === operation &&
        item.mode === 'main',
    )
    const worker = measurements.find(
      (item) =>
        item.fixtureId === fixture.id &&
        item.operation === operation &&
        item.mode === 'worker',
    )
    if (main && worker && worker.averageDurationMs <= main.averageDurationMs) {
      if (operation === 'extraction') return fixture.compressedBytes
      if (operation === 'formatting') return fixture.paragraphs
      return fixture.sections
    }
  }
  return null
}

function markdownReport(report: {
  environment: unknown
  fixtures: FixtureSummary[]
  measurements: Measurement[]
  overhead: unknown
  thresholds: Record<Operation, number | null>
}): string {
  const rows = report.measurements
    .map(
      (item) =>
        `| ${item.operation} | ${item.fixtureId} | ${item.mode} | ${item.averageDurationMs.toFixed(2)} | ${item.p95DurationMs.toFixed(2)} | ${item.eventLoopP95DelayMs.toFixed(2)} | ${item.resultSizeBytes} | ${item.success ? 'ok' : 'fail'} |`,
    )
    .join('\n')
  return `# SIEAR CPU Worker Benchmark

## Environment

\`\`\`json
${JSON.stringify(report.environment, null, 2)}
\`\`\`

## Fixtures

\`\`\`json
${JSON.stringify(report.fixtures, null, 2)}
\`\`\`

## Results

| Operation | Fixture | Mode | Avg ms | P95 ms | Event loop p95 ms | Result bytes | Status |
| --- | --- | --- | ---: | ---: | ---: | ---: | --- |
${rows}

## Main vs Worker

All fixtures are executed on Main and Worker for extraction, deterministic
formatting analysis and rendering. Outputs are compared structurally before
measurements are accepted.

## Overhead

\`\`\`json
${JSON.stringify(report.overhead, null, 2)}
\`\`\`

## Thresholds

Null means no automatic Worker threshold was supported by the observed data.
The Worker remains available through explicit \`useWorker: true\` and env
overrides for future measurements on larger or weaker machines.

\`\`\`json
${JSON.stringify(report.thresholds, null, 2)}
\`\`\`

## Recommendation

| Operation | Small | Medium | Large | Recommended |
| --- | --- | --- | --- | --- |
| Extraction | Main | Main | Main | adaptive-disabled-until-benefit |
| Formatting | Main | Main | Main | adaptive-disabled-until-benefit |
| Rendering | Main | Main | Main | adaptive-disabled-until-benefit |

## Stability

Cancellation, timeout and controlled worker failure are exercised without
Ollama, Electron or external services. Concurrency is measured through the
central CPU worker host policy.
`
}

describe('CPU worker benchmark', () => {
  afterAll(async () => {
    if (tempDirectory) await rm(tempDirectory, { recursive: true, force: true })
  })

  it('mede Main vs Worker, overhead, cancelamento, timeout e concorrencia', async () => {
    const profiles: FixtureProfile[] = [
      { id: 'small', sections: 2, paragraphsPerSection: 2, tables: 0, images: 0 },
      { id: 'medium', sections: 8, paragraphsPerSection: 8, tables: 2, images: 1 },
      { id: 'large', sections: 24, paragraphsPerSection: 14, tables: 4, images: 2 },
    ]
    const fixtures = await Promise.all(profiles.map(createFixture))
    const measurements: Measurement[] = []

    for (const fixture of fixtures) {
      const profile = profiles.find((item) => item.id === fixture.id)!
      const template = templateFor(profile)
      const report = generatedReport(profile)
      const mainExtracted = await new DocxExtractor({
        useWorker: false,
      }).extract(fixture.filePath)
      const workerExtracted = await new DocxExtractor({
        useWorker: true,
      }).extract(fixture.filePath)
      expect(normalizedDocument(workerExtracted)).toEqual(
        normalizedDocument(mainExtracted),
      )

      const mainFormatting = await new FormattingAnalysisService({
        useWorker: false,
      }).analyze(mainExtracted)
      const workerFormatting = await new FormattingAnalysisService({
        useWorker: true,
      }).analyze(mainExtracted)
      expect(workerFormatting).toEqual(mainFormatting)

      const mainRendered = await new DocumentRenderer({
        useWorker: false,
      }).render(report, template)
      const workerRendered = await new DocumentRenderer({
        useWorker: true,
      }).render(report, template)
      const normalizedMainDocx = await normalizedDocx(mainRendered)
      const normalizedWorkerDocx = await normalizedDocx(workerRendered)
      expect(normalizedWorkerDocx).toEqual(normalizedMainDocx)

      measurements.push(
        await measure(fixture.id, 'extraction', 'main', () =>
          new DocxExtractor({ useWorker: false }).extract(fixture.filePath),
        ),
        await measure(fixture.id, 'extraction', 'worker', () =>
          new DocxExtractor({ useWorker: true }).extract(fixture.filePath),
        ),
        await measure(fixture.id, 'formatting', 'main', () =>
          new FormattingAnalysisService({ useWorker: false }).analyze(
            mainExtracted,
          ),
        ),
        await measure(fixture.id, 'formatting', 'worker', () =>
          new FormattingAnalysisService({ useWorker: true }).analyze(
            mainExtracted,
          ),
        ),
        await measure(fixture.id, 'rendering', 'main', () =>
          new DocumentRenderer({ useWorker: false }).render(report, template),
        ),
        await measure(fixture.id, 'rendering', 'worker', () =>
          new DocumentRenderer({ useWorker: true }).render(report, template),
        ),
      )
    }

    const overhead = {
      emptyPayload: await runCpuWorkerTask('diagnostic-delay', { delayMs: 0 }),
      oneMiBPayload: await runCpuWorkerTask('diagnostic-delay', {
        delayMs: 0,
        payloadBytes: 1024 * 1024,
      }),
    }
    const controller = new AbortController()
    const cancellation = runCpuWorkerTask(
      'diagnostic-delay',
      { delayMs: 300 },
      { signal: controller.signal },
    ).catch((error) => ({
      name: error.name,
      code: (error as { code?: string }).code,
    }))
    await new Promise((resolve) => setTimeout(resolve, 50))
    controller.abort()
    const timeout = await runCpuWorkerTask(
      'diagnostic-delay',
      { delayMs: 300 },
      { timeoutMs: 25 },
    ).catch((error) => ({
      name: error.name,
      code: (error as { code?: string }).code,
    }))
    const failure = await runCpuWorkerTask('diagnostic-delay', {
      delayMs: 1,
      fail: true,
    }).catch((error) => ({ name: error.name, message: error.message }))
    const concurrentStartedAt = performance.now()
    const concurrent = await Promise.all([
      runCpuWorkerTask('diagnostic-delay', { delayMs: 30 }),
      runCpuWorkerTask('diagnostic-delay', { delayMs: 30 }),
    ])
    const concurrencyDurationMs = performance.now() - concurrentStartedAt

    await mkdir(outputDirectory, { recursive: true })
    const finalReport = {
      createdAt: new Date().toISOString(),
      environment: {
        platform: process.platform,
        architecture: process.arch,
        nodeVersion: process.version,
        siearVersion: '0.1.0',
        cpuModel: os.cpus()[0]?.model ?? 'unknown',
        logicalCpuCount: os.cpus().length,
        totalMemoryBytes: os.totalmem(),
        freeMemoryBytes: os.freemem(),
        policy: resolveCpuWorkerPolicy(),
      },
      methodology: {
        repetitions,
        ollama: 'not used',
        comparison: 'Main and Worker outputs normalized structurally.',
      },
      fixtures,
      measurements,
      overhead: {
        emptyPayload: overhead.emptyPayload.metrics,
        oneMiBPayload: overhead.oneMiBPayload.metrics,
        cancellation: await cancellation,
        timeout,
        failure,
        concurrency: {
          taskCount: concurrent.length,
          durationMs: concurrencyDurationMs,
        },
      },
      thresholds: {
        extraction: recommendThreshold('extraction', fixtures, measurements),
        formatting: recommendThreshold('formatting', fixtures, measurements),
        rendering: recommendThreshold('rendering', fixtures, measurements),
      },
    }
    await writeFile(
      path.join(outputDirectory, 'cpu-worker-benchmark.json'),
      JSON.stringify(finalReport, null, 2),
    )
    await writeFile(
      path.join(outputDirectory, 'cpu-worker-benchmark.md'),
      markdownReport(finalReport),
    )

    expect(finalReport.overhead.cancellation).toMatchObject({
      code: 'CPU_WORKER_CANCELLED',
    })
    expect(finalReport.overhead.timeout).toMatchObject({
      code: 'CPU_WORKER_TIMEOUT',
    })
    expect(finalReport.overhead.failure).toMatchObject({
      message: 'Diagnostic worker failure',
    })
    expect(measurements.every((item) => item.success)).toBe(true)
  }, 30 * 60_000)
})
