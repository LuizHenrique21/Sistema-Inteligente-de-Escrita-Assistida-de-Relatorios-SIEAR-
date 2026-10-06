import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DocumentExtractorService } from '../documents/document-extractor.service'
import { StructureAnalysisService } from '../documents/structure-analysis.service'
import {
  OllamaService,
  type OllamaGenerationMetrics,
} from '../ollama/ollama.service'
import {
  WritingAnalysisService,
  isWritingPattern,
  type WritingAttempt,
} from './writing-analysis.service'
import { buildWritingAnalysisInput } from './prompts/writing-analysis.prompt'
import { hashDocumentFile } from '../templates/pipeline-checkpoint.hash'
import { InMemoryPipelineCheckpointRepository } from '../../repositories/checkpoints/in-memory-pipeline-checkpoint.repository'
import { PipelineCheckpointCoordinator } from '../templates/pipeline-checkpoint.coordinator'
import { createPipelineCheckpointCompatibility } from '../templates/pipeline-checkpoint.config'
import {
  WRITING_SETTINGS,
  WRITING_ANALYZER_VERSION,
} from './writing/writing-contract'

describe.skipIf(process.env.SIEAR_WRITING_INTEGRATION !== 'true')(
  'WritingAnalysis real qwen3:8b — estabilidade',
  () => {
    it(
      'valida N execuções frias e verifica retomada',
      async () => {
        const filePath = process.env.SIEAR_WRITING_ANALYSIS_DOCX
        if (!filePath) throw new Error('Defina SIEAR_WRITING_ANALYSIS_DOCX.')
        const runs = Number(process.env.SIEAR_WRITING_RUNS ?? 5)
        if (!Number.isInteger(runs) || runs < 1 || runs > 20)
          throw new Error('SIEAR_WRITING_RUNS deve estar entre 1 e 20.')
        const hash = await hashDocumentFile(filePath)
        const outputDirectory = path.resolve('benchmark-results')
        await mkdir(outputDirectory, { recursive: true })
        const results: Array<Record<string, unknown>> = []
        const reportPath = path.join(
          outputDirectory,
          `writing-stability-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        )
        for (let index = 0; index < runs; index++) {
          const started = performance.now()
          const attempts: WritingAttempt[] = []
          const structureMetrics: OllamaGenerationMetrics[] = []
          const reused: string[] = []
          let failure: Record<string, unknown> | null = null
          let writingDurationMs: number | null = null
          let resumedCalls: number | null = null
          const ollama = new OllamaService({ model: 'qwen3:8b' })
          const repository = new InMemoryPipelineCheckpointRepository()
          const checkpoints = {
            coordinator: new PipelineCheckpointCoordinator(
              repository,
              createPipelineCheckpointCompatibility('qwen3:8b'),
            ),
            documentHash: hash,
          }
          try {
            const document = await new DocumentExtractorService().extract(
              filePath,
            )
            const structure = await new StructureAnalysisService(
              new OllamaService({
                model: 'qwen3:8b',
                onMetrics: (m) => structureMetrics.push(m),
              }),
            ).analyze(document)
            const service = new WritingAnalysisService(ollama)
            const writingStarted = performance.now()
            const result = await service.analyze(document, structure, {
              checkpoints,
              onAttempt: (a) => {
                attempts.push(a)
                console.info(
                  JSON.stringify({
                    run: index + 1,
                    scope: a.scope,
                    attempt: a.attempt,
                    durationMs: a.durationMs,
                    generatedTokens: a.metrics?.generatedTokens,
                    issueCodes: a.issueCodes,
                  }),
                )
              },
            })
            writingDurationMs = Math.round(performance.now() - writingStarted)
            expect(
              isWritingPattern(
                result,
                buildWritingAnalysisInput(document, structure),
              ),
            ).toBe(true)
            let calls = 0
            await service.analyze(document, structure, {
              checkpoints,
              onAttempt: () => {
                calls++
              },
              onReuse: (scope) => reused.push(scope),
            })
            resumedCalls = calls
            expect(calls).toBe(0)
          } catch (error: unknown) {
            failure = {
              name: error instanceof Error ? error.name : 'UnknownError',
              code:
                typeof error === 'object' && error !== null && 'code' in error
                  ? error.code
                  : null,
              internalCode:
                typeof error === 'object' &&
                error !== null &&
                'internalCode' in error
                  ? error.internalCode
                  : null,
            }
          }
          const sum = (field: 'promptTokens' | 'generatedTokens') =>
            attempts.every((a) => a.metrics?.[field] == null)
              ? null
              : attempts.reduce((n, a) => n + (a.metrics?.[field] ?? 0), 0)
          results.push({
            run: index + 1,
            status: failure ? 'failed' : 'completed',
            failure,
            totalDurationMs: Math.round(performance.now() - started),
            writingDurationMs,
            globalCalls: attempts.filter((a) => a.scope === 'global').length,
            sectionCalls: attempts.filter((a) => a.scope !== 'global').length,
            retries: attempts.filter((a) => a.attempt > 0).length,
            promptTokens: sum('promptTokens'),
            generatedTokens: sum('generatedTokens'),
            largestResponseCharacters: Math.max(
              0,
              ...attempts.map((a) => a.responseCharacters),
            ),
            invalidEvidence: attempts
              .flatMap((a) => a.issueCodes)
              .filter((c) => c === 'UNKNOWN_EVIDENCE_ID').length,
            attempts,
            structureMetrics,
            resumedCalls,
            reusedUnits: reused.length,
          })
          const successes = results.filter(
            (r) => r.status === 'completed',
          ).length
          await writeFile(
            reportPath,
            JSON.stringify(
              {
                model: 'qwen3:8b',
                fixtureHash: hash,
                analyzerVersion: WRITING_ANALYZER_VERSION,
                settings: WRITING_SETTINGS,
                requestedRuns: runs,
                completedRuns: results.length,
                successes,
                successRate: successes / results.length,
                results,
              },
              null,
              2,
            ),
            'utf8',
          )
          console.info(
            JSON.stringify({
              run: index + 1,
              status: failure ? 'failed' : 'completed',
              writingDurationMs,
              reportPath,
            }),
          )
        }
        expect(results.filter((r) => r.status === 'completed')).toHaveLength(
          runs,
        )
      },
      60 * 60_000,
    )
  },
)
