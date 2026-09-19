import { randomUUID } from 'node:crypto'
import { mkdir, mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { performance } from 'node:perf_hooks'
import { describe, expect, it } from 'vitest'
import { SqlitePipelineCheckpointRepository } from '../repositories/checkpoints/sqlite-pipeline-checkpoint.repository'
import { SemanticAnalysisService } from '../services/ai/semantic-analysis.service'
import { WritingAnalysisService } from '../services/ai/writing-analysis.service'
import { DocumentExtractorService } from '../services/documents/document-extractor.service'
import { FormattingAnalysisService } from '../services/documents/formatting-analysis.service'
import { StructureAnalysisService } from '../services/documents/structure-analysis.service'
import {
  OllamaService,
  type OllamaGenerationMetrics,
} from '../services/ollama/ollama.service'
import { createPipelineCheckpointCompatibility } from '../services/templates/pipeline-checkpoint.config'
import { PipelineCheckpointCoordinator } from '../services/templates/pipeline-checkpoint.coordinator'
import { hashDocumentFile } from '../services/templates/pipeline-checkpoint.hash'
import { ReportTemplateBuilder } from '../services/templates/report-template.builder'
import { TemplateCreationPipeline } from '../services/templates/template-creation.pipeline'

interface SafeFailure {
  name: string
  code: string | null
}

interface AttemptResult {
  durationMs: number
  success: boolean
  failure: SafeFailure | null
  ollamaCalls: OllamaGenerationMetrics[]
  executedStages: Record<string, number>
}

function safeFailure(error: unknown): SafeFailure {
  const name = error instanceof Error ? error.name : 'UnknownError'
  const code =
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string'
      ? error.code
      : null
  return { name, code }
}

function rounded(value: number): number {
  return Math.round(value * 100) / 100
}

describe('baseline real de retomada por checkpoint', () => {
  it(
    'compara a primeira tentativa com a segunda execução do mesmo DOCX',
    async () => {
      const filePath = process.env.SIEAR_BENCHMARK_DOCX
      if (!filePath)
        throw new Error(
          'Defina SIEAR_BENCHMARK_DOCX com o caminho do DOCX representativo.',
        )
      const outputDirectory = path.resolve(
        process.env.SIEAR_BENCHMARK_OUTPUT ?? 'benchmark-results',
      )
      const temporaryDirectory = await mkdtemp(
        path.join(tmpdir(), 'siear-checkpoint-benchmark-'),
      )
      const repository = new SqlitePipelineCheckpointRepository(
        path.join(temporaryDirectory, 'checkpoint.sqlite3'),
      )
      const metricsByAttempt: OllamaGenerationMetrics[][] = [[], []]
      let attemptIndex = 0
      const ollama = new OllamaService({
        onMetrics: (metrics) => metricsByAttempt[attemptIndex]?.push(metrics),
      })
      const counters = {
        extraction: 0,
        structure: 0,
        writing: 0,
        semantic: 0,
        formatting: 0,
        consolidation: 0,
      }
      const extractor = new DocumentExtractorService()
      const structureAnalyzer = new StructureAnalysisService(ollama)
      const writingAnalyzer = new WritingAnalysisService(ollama)
      const semanticAnalyzer = new SemanticAnalysisService(ollama)
      const formattingAnalyzer = new FormattingAnalysisService()
      const builder = new ReportTemplateBuilder()
      const pipeline = new TemplateCreationPipeline(
        {
          extract: async (selectedPath) => {
            counters.extraction += 1
            return extractor.extract(selectedPath)
          },
        },
        {
          analyze: async (document) => {
            counters.structure += 1
            return structureAnalyzer.analyze(document)
          },
        },
        {
          analyze: async (document, structure) => {
            counters.writing += 1
            return writingAnalyzer.analyze(document, structure)
          },
        },
        {
          analyze: async (document, structure, writing) => {
            counters.semantic += 1
            return semanticAnalyzer.analyze(document, structure, writing)
          },
        },
        {
          analyze: (document) => {
            counters.formatting += 1
            return formattingAnalyzer.analyze(document)
          },
        },
        {
          build: (input) => {
            counters.consolidation += 1
            return builder.build(input)
          },
        },
        {
          coordinator: new PipelineCheckpointCoordinator(
            repository,
            createPipelineCheckpointCompatibility(ollama.modelName),
          ),
        },
      )

      const executeAttempt = async (index: number): Promise<AttemptResult> => {
        attemptIndex = index
        const before = { ...counters }
        const startedAt = performance.now()
        let failure: SafeFailure | null = null
        try {
          await pipeline.execute(filePath)
        } catch (error: unknown) {
          failure = safeFailure(error)
        }
        const executedStages = Object.fromEntries(
          Object.entries(counters).map(([stage, count]) => [
            stage,
            count - before[stage as keyof typeof before],
          ]),
        )
        return {
          durationMs: rounded(performance.now() - startedAt),
          success: failure === null,
          failure,
          ollamaCalls: metricsByAttempt[index] ?? [],
          executedStages,
        }
      }

      let first: AttemptResult
      let second: AttemptResult
      try {
        first = await executeAttempt(0)
        second = await executeAttempt(1)
      } finally {
        repository.close()
        await rm(temporaryDirectory, { recursive: true, force: true })
      }
      const file = await stat(filePath)
      const documentHash = await hashDocumentFile(filePath)
      const savedMs = rounded(first.durationMs - second.durationMs)
      const reductionPercent =
        first.durationMs > 0
          ? rounded((savedMs / first.durationMs) * 100)
          : null
      const report = {
        version: 1,
        operationId: randomUUID(),
        createdAt: new Date().toISOString(),
        fixture: {
          id: process.env.SIEAR_BENCHMARK_FIXTURE_ID ?? 'local-docx',
          sizeBytes: file.size,
          documentHash,
        },
        model: ollama.modelName,
        first,
        second,
        comparison: { savedMs, reductionPercent },
      }
      await mkdir(outputDirectory, { recursive: true })
      const outputPath = path.join(
        outputDirectory,
        `checkpoint-resume-${report.createdAt.replace(/[:.]/g, '-')}.json`,
      )
      await writeFile(outputPath, JSON.stringify(report, null, 2), 'utf8')
      console.info(`Benchmark de retomada gravado em ${outputPath}`)
      console.info(
        JSON.stringify({
          firstDurationMs: first.durationMs,
          secondDurationMs: second.durationMs,
          savedMs,
          reductionPercent,
          firstFailure: first.failure,
          secondFailure: second.failure,
          secondExecutedStages: second.executedStages,
        }),
      )
      expect(documentHash).toHaveLength(64)
      expect(second.executedStages.extraction).toBe(0)
    },
    30 * 60_000,
  )
})
