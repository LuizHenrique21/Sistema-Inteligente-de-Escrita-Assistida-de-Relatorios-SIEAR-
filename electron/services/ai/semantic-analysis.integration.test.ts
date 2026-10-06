import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { DocumentExtractorService } from '../documents/document-extractor.service'
import { StructureAnalysisService } from '../documents/structure-analysis.service'
import { OllamaService } from '../ollama/ollama.service'
import { WritingAnalysisService } from './writing-analysis.service'
import {
  SemanticAnalysisService,
  type SemanticAttempt,
} from './semantic-analysis.service'
import { createSemanticContext } from './semantic/semantic-context'
import { isSemanticPattern } from './semantic/semantic-pattern.validation'
import { hashDocumentFile } from '../templates/pipeline-checkpoint.hash'
import { InMemoryPipelineCheckpointRepository } from '../../repositories/checkpoints/in-memory-pipeline-checkpoint.repository'
import { PipelineCheckpointCoordinator } from '../templates/pipeline-checkpoint.coordinator'
import { createPipelineCheckpointCompatibility } from '../templates/pipeline-checkpoint.config'
import { SEMANTIC_ANALYZER_VERSION, SEMANTIC_SETTINGS } from './semantic/semantic-contract'

describe.skipIf(process.env.SIEAR_SEMANTIC_INTEGRATION !== 'true')(
  'SemanticAnalysis real qwen3:8b - estabilidade',
  () => {
    it(
      'executa DOCX -> extraction -> structure -> writing -> semantic N vezes',
      async () => {
        const filePath = process.env.SIEAR_SEMANTIC_ANALYSIS_DOCX
        if (!filePath) throw new Error('Defina SIEAR_SEMANTIC_ANALYSIS_DOCX.')
        const runs = Number(process.env.SIEAR_SEMANTIC_RUNS ?? 5)
        if (!Number.isInteger(runs) || runs < 1 || runs > 20)
          throw new Error('SIEAR_SEMANTIC_RUNS deve estar entre 1 e 20.')
        const documentHash = await hashDocumentFile(filePath)
        const directory = path.resolve('benchmark-results')
        await mkdir(directory, { recursive: true })
        const reportPath = path.join(
          directory,
          `semantic-stability-${new Date().toISOString().replace(/[:.]/g, '-')}.json`,
        )
        const results: Array<Record<string, unknown>> = []
        for (let index = 0; index < runs; index++) {
          const started = performance.now()
          const attempts: SemanticAttempt[] = []
          let failure: Record<string, unknown> | null = null
          let semanticDurationMs: number | null = null
          try {
            const document = await new DocumentExtractorService().extract(filePath)
            const structure = await new StructureAnalysisService(
              new OllamaService({ model: 'qwen3:8b' }),
            ).analyze(document)
            const writing = await new WritingAnalysisService(
              new OllamaService({ model: 'qwen3:8b' }),
            ).analyze(document, structure)
            const checkpoints = {
              coordinator: new PipelineCheckpointCoordinator(
                new InMemoryPipelineCheckpointRepository(),
                createPipelineCheckpointCompatibility('qwen3:8b'),
              ),
              documentHash,
            }
            const semanticStarted = performance.now()
            const semantic = await new SemanticAnalysisService(
              new OllamaService({ model: 'qwen3:8b' }),
            ).analyze(document, structure, writing, {
              checkpoints,
              onAttempt: (attempt) => attempts.push(attempt),
            })
            semanticDurationMs = Math.round(performance.now() - semanticStarted)
            expect(
              isSemanticPattern(
                semantic,
                createSemanticContext(document, structure, writing),
              ),
            ).toBe(true)
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
            attempts.every((attempt) => attempt.metrics?.[field] == null)
              ? null
              : attempts.reduce(
                  (total, attempt) => total + (attempt.metrics?.[field] ?? 0),
                  0,
                )
          results.push({
            run: index + 1,
            status: failure ? 'failed' : 'completed',
            failure,
            totalDurationMs: Math.round(performance.now() - started),
            semanticDurationMs,
            globalCalls: attempts.filter((attempt) => attempt.scope === 'global').length,
            sectionCalls: attempts.filter((attempt) => attempt.scope.startsWith('section/')).length,
            relationCalls: attempts.filter((attempt) => attempt.scope === 'relations').length,
            retries: attempts.filter((attempt) => attempt.attempt > 0).length,
            promptTokens: sum('promptTokens'),
            generatedTokens: sum('generatedTokens'),
            invalidEvidence: attempts
              .flatMap((attempt) => attempt.issueCodes)
              .filter((code) => code === 'UNKNOWN_SEMANTIC_EVIDENCE').length,
            invalidRelations: attempts
              .flatMap((attempt) => attempt.issueCodes)
              .filter((code) => code.includes('RELATION')).length,
            attempts: attempts.map((attempt) => ({
              scope: attempt.scope,
              attempt: attempt.attempt,
              durationMs: attempt.durationMs,
              issueCodes: attempt.issueCodes,
              promptTokens: attempt.metrics?.promptTokens ?? null,
              generatedTokens: attempt.metrics?.generatedTokens ?? null,
            })),
          })
          const successes = results.filter((result) => result.status === 'completed').length
          await writeFile(
            reportPath,
            JSON.stringify(
              {
                model: 'qwen3:8b',
                fixtureHash: documentHash,
                analyzerVersion: SEMANTIC_ANALYZER_VERSION,
                settings: SEMANTIC_SETTINGS,
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
        }
        expect(results.filter((result) => result.status === 'completed')).toHaveLength(runs)
      },
      60 * 60_000,
    )
  },
)
