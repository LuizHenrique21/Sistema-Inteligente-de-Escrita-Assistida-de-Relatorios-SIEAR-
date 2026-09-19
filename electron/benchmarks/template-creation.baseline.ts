import { createHash } from 'node:crypto'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import os from 'node:os'
import path from 'node:path'
import { monitorEventLoopDelay, performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { SqliteReportTemplateRepository } from '../repositories/templates/sqlite-report-template.repository'
import { SemanticAnalysisService } from '../services/ai/semantic-analysis.service'
import { WritingAnalysisService } from '../services/ai/writing-analysis.service'
import { DocumentExtractorService } from '../services/documents/document-extractor.service'
import { FormattingAnalysisService } from '../services/documents/formatting-analysis.service'
import { StructureAnalysisService } from '../services/documents/structure-analysis.service'
import {
  OllamaService,
  type OllamaGenerationMetrics,
} from '../services/ollama/ollama.service'
import { ReportTemplateBuilder } from '../services/templates/report-template.builder'
import { BaselineCollector } from './baseline.collector'
import { BASELINE_REPORT_VERSION, type BaselineReport } from './baseline.types'

const MODEL = 'qwen3:8b'
const PIPELINE_STAGES = [
  'extraction',
  'structure',
  'writing',
  'semantic',
  'formatting',
  'consolidation',
  'sqlite-initialization',
  'sqlite-create',
  'sqlite-get-by-id',
  'sqlite-get-all',
] as const
const OUTSIDE_TEMPLATE_BENCHMARK = [
  'ipc',
  'generation',
  'document-rendering',
] as const

function safeError(error: unknown): BaselineReport['failure'] {
  if (!(error instanceof Error))
    return { name: 'UnknownError', code: null }
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : null
  return { name: error.name, code }
}

function serializedBytes(value: unknown): number {
  return Buffer.byteLength(JSON.stringify(value), 'utf8')
}

function textBytes(value: string): number {
  return Buffer.byteLength(value, 'utf8')
}

function milliseconds(value: number): number {
  return Number.isFinite(value)
    ? Math.round((value / 1_000_000) * 100) / 100
    : 0
}

function nullableTotal(values: Array<number | null>): number | null {
  return values.every((value) => value === null)
    ? null
    : values.reduce<number>((total, value) => total + (value ?? 0), 0)
}

describe('baseline real de criação de template', () => {
  it(
    'registra métricas reproduzíveis sem exigir sucesso do pipeline',
    async () => {
      const filePath = process.env.SIEAR_BENCHMARK_DOCX
      if (!filePath)
        throw new Error(
          'Defina SIEAR_BENCHMARK_DOCX com o caminho do DOCX representativo.',
        )
      const outputDirectory = path.resolve(
        process.env.SIEAR_BENCHMARK_OUTPUT ?? 'benchmark-results',
      )
      const file = await stat(filePath)
      const source = await readFile(filePath)
      const sha256 = createHash('sha256').update(source).digest('hex')
      const collector = new BaselineCollector({
        requestId: process.env.SIEAR_BENCHMARK_REQUEST_ID,
      })
      const loop = monitorEventLoopDelay({ resolution: 20 })
      const memoryBefore = process.memoryUsage()
      const freeMemoryBeforeBytes = os.freemem()
      const originalClone = globalThis.structuredClone
      let structuredCloneCalls = 0
      globalThis.structuredClone = ((value, options) => {
        structuredCloneCalls += 1
        return originalClone(value, options)
      }) as typeof structuredClone
      const totalStartedAt = performance.now()
      let failure: BaselineReport['failure'] = null
      let templateJsonBytes: number | null = null
      let estimatedCreateIpcBytes: number | null = null
      let estimatedGetAllIpcBytes: number | null = null
      let temporaryDirectory: string | null = null
      loop.enable()
      try {
        const ollama = new OllamaService({
          onMetrics: (metrics: OllamaGenerationMetrics) =>
            collector.recordOllamaCall(metrics),
        })
        const document = await collector.measure(
          'extraction',
          () => new DocumentExtractorService().extract(filePath),
          {
            inputSizeBytes: file.size,
            outputSizeBytes: serializedBytes,
          },
        )
        const documentSize = serializedBytes(document)
        const structure = await collector.measure(
          'structure',
          () => new StructureAnalysisService(ollama).analyze(document),
          {
            inputSizeBytes: documentSize,
            outputSizeBytes: serializedBytes,
          },
        )
        const structureSize = serializedBytes(structure)
        const writing = await collector.measure(
          'writing',
          () => new WritingAnalysisService(ollama).analyze(document, structure),
          {
            inputSizeBytes: documentSize + structureSize,
            outputSizeBytes: serializedBytes,
          },
        )
        const writingSize = serializedBytes(writing)
        const semantic = await collector.measure(
          'semantic',
          () =>
            new SemanticAnalysisService(ollama).analyze(
              document,
              structure,
              writing,
            ),
          {
            inputSizeBytes: documentSize + structureSize + writingSize,
            outputSizeBytes: serializedBytes,
          },
        )
        const semanticSize = serializedBytes(semantic)
        const formatting = await collector.measure(
          'formatting',
          () => new FormattingAnalysisService().analyze(document),
          {
            inputSizeBytes: documentSize,
            outputSizeBytes: serializedBytes,
          },
        )
        const formattingSize = serializedBytes(formatting)
        const template = await collector.measure(
          'consolidation',
          () =>
            new ReportTemplateBuilder().build({
              document,
              structure,
              writing,
              semantic,
              formatting,
            }),
          {
            inputSizeBytes:
              documentSize +
              structureSize +
              writingSize +
              semanticSize +
              formattingSize,
            outputSizeBytes: serializedBytes,
          },
        )
        const serialized = JSON.stringify(template)
        templateJsonBytes = Buffer.byteLength(serialized)
        estimatedCreateIpcBytes = Buffer.byteLength(
          JSON.stringify({ success: true, data: template }),
        )
        estimatedGetAllIpcBytes = Buffer.byteLength(
          JSON.stringify({ success: true, data: [template] }),
        )
        temporaryDirectory = await mkdtemp(
          path.join(tmpdir(), 'siear-baseline-'),
        )
        const repository = await collector.measure(
          'sqlite-initialization',
          () =>
            new SqliteReportTemplateRepository(
              path.join(temporaryDirectory!, 'baseline.sqlite3'),
            ),
          {
            inputSizeBytes: textBytes(
              path.join(temporaryDirectory, 'baseline.sqlite3'),
            ),
          },
        )
        try {
          await collector.measure(
            'sqlite-create',
            () => repository.create(template),
            {
              inputSizeBytes: templateJsonBytes,
              outputSizeBytes: serializedBytes,
            },
          )
          await collector.measure(
            'sqlite-get-by-id',
            () => repository.getById(template.metadata.id),
            {
              inputSizeBytes: textBytes(template.metadata.id),
              outputSizeBytes: serializedBytes,
            },
          )
          await collector.measure(
            'sqlite-get-all',
            () => repository.getAll(),
            {
              inputSizeBytes: 0,
              outputSizeBytes: serializedBytes,
            },
          )
        } finally {
          repository.close()
        }
      } catch (error: unknown) {
        failure = safeError(error)
      } finally {
        loop.disable()
        globalThis.structuredClone = originalClone
        if (temporaryDirectory)
          await rm(temporaryDirectory, { recursive: true, force: true })
      }
      const memoryAfter = process.memoryUsage()
      PIPELINE_STAGES.forEach((stage) =>
        collector.recordUnavailable(stage, 'not-reached'),
      )
      OUTSIDE_TEMPLATE_BENCHMARK.forEach((stage) =>
        collector.recordUnavailable(stage, 'not-measured'),
      )
      const report: BaselineReport = {
        version: BASELINE_REPORT_VERSION,
        benchmarkId: collector.operationId,
        operationId: collector.operationId,
        requestId: collector.requestId,
        createdAt: new Date().toISOString(),
        status: failure ? 'failed' : 'completed',
        failure,
        fixture: {
          id: process.env.SIEAR_BENCHMARK_FIXTURE_ID ?? 'local-docx',
          sizeBytes: file.size,
          sha256,
        },
        environment: {
          platform: process.platform,
          architecture: process.arch,
          nodeVersion: process.version,
          cpuModel: os.cpus()[0]?.model ?? 'unknown',
          logicalCpuCount: os.cpus().length,
          totalMemoryBytes: os.totalmem(),
          freeMemoryBeforeBytes,
          model: MODEL,
        },
        totalDurationMs:
          Math.round((performance.now() - totalStartedAt) * 100) / 100,
        stages: collector.stages,
        ollama: {
          callCount: collector.ollamaCalls.length,
          totalPromptCharacters: collector.ollamaCalls.reduce(
            (total, call) => total + call.promptCharacters,
            0,
          ),
          totalResponseCharacters: collector.ollamaCalls.reduce(
            (total, call) => total + call.responseCharacters,
            0,
          ),
          totalPromptTokens: nullableTotal(
            collector.ollamaCalls.map((call) => call.promptTokens),
          ),
          totalGeneratedTokens: nullableTotal(
            collector.ollamaCalls.map((call) => call.generatedTokens),
          ),
          calls: collector.ollamaCalls,
        },
        memory: {
          heapBeforeBytes: memoryBefore.heapUsed,
          heapAfterBytes: memoryAfter.heapUsed,
          heapPeakObservedBytes: collector.heapPeakObservedBytes,
          rssBeforeBytes: memoryBefore.rss,
          rssAfterBytes: memoryAfter.rss,
        },
        eventLoop: {
          meanDelayMs: Number.isFinite(loop.mean)
            ? milliseconds(loop.mean)
            : null,
          maxDelayMs: milliseconds(loop.max),
          p99DelayMs: milliseconds(loop.percentile(99)),
        },
        serialization: {
          structuredCloneCalls,
          templateJsonBytes,
          estimatedCreateIpcBytes,
          estimatedGetAllIpcBytes,
        },
      }
      await mkdir(outputDirectory, { recursive: true })
      const outputPath = path.join(
        outputDirectory,
        `template-creation-${report.createdAt.replace(/[:.]/g, '-')}.json`,
      )
      await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')
      console.info(`Baseline gravado em ${outputPath}`)
      console.info(
        JSON.stringify({
          status: report.status,
          totalDurationMs: report.totalDurationMs,
          ollamaCalls: report.ollama.callCount,
          promptTokens: report.ollama.totalPromptTokens,
          generatedTokens: report.ollama.totalGeneratedTokens,
          failure: report.failure,
        }),
      )
      expect(report.fixture.sha256).toHaveLength(64)
      expect(report.stages.length).toBeGreaterThan(0)
    },
    30 * 60_000,
  )
})
