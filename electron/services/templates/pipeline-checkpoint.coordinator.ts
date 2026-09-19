import { getLogger } from '../../infrastructure/logging/logger.runtime'
import { REPORT_TEMPLATE_VERSION } from '../../../src/domain/templates/report-template'
import type { PipelineCheckpointCompatibility } from './pipeline-checkpoint.config'
import {
  checkpointId,
  hashCheckpointResult,
} from './pipeline-checkpoint.hash'
import {
  PIPELINE_CHECKPOINT_SCHEMA_VERSION,
  type PipelineCheckpoint,
  type PipelineCheckpointIdentity,
  type PipelineCheckpointRepository,
  type PipelineCheckpointStage,
  type SafeCheckpointError,
} from './pipeline-checkpoint.types'

const logger = getLogger('PipelineCheckpointCoordinator')

export interface CheckpointStageResult<T> {
  value: T
  resultHash: string
  reused: boolean
}

function safeError(error: unknown): SafeCheckpointError {
  const rawName = error instanceof Error ? error.name : 'UnknownError'
  const name = /^[A-Za-z][A-Za-z0-9_.-]{0,63}$/.test(rawName)
    ? rawName
    : 'Error'
  const rawCode =
    typeof error === 'object' && error !== null && 'code' in error
      ? error.code
      : null
  const code =
    typeof rawCode === 'string' && /^[A-Z0-9_-]{1,64}$/.test(rawCode)
      ? rawCode
      : null
  return { name, code }
}

function sameIdentity(
  checkpoint: PipelineCheckpoint,
  identity: PipelineCheckpointIdentity,
): boolean {
  return (
    checkpoint.schemaVersion === PIPELINE_CHECKPOINT_SCHEMA_VERSION &&
    checkpoint.id === checkpointId(identity) &&
    checkpoint.documentHash === identity.documentHash &&
    checkpoint.templateVersion === identity.templateVersion &&
    checkpoint.stage === identity.stage &&
    checkpoint.stageVersion === identity.stageVersion &&
    checkpoint.analyzerVersion === identity.analyzerVersion &&
    checkpoint.promptVersion === identity.promptVersion &&
    checkpoint.model === identity.model &&
    checkpoint.configurationHash === identity.configurationHash &&
    checkpoint.inputHash === identity.inputHash
  )
}

export class PipelineCheckpointCoordinator {
  constructor(
    private readonly repository: PipelineCheckpointRepository,
    private readonly compatibility: PipelineCheckpointCompatibility,
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  async run<T>(
    stage: PipelineCheckpointStage,
    documentHash: string,
    inputHash: string,
    operation: () => T | Promise<T>,
    validator: (value: unknown) => value is T,
  ): Promise<CheckpointStageResult<T>> {
    const definition = this.compatibility[stage]
    const identity: PipelineCheckpointIdentity = {
      documentHash,
      templateVersion: REPORT_TEMPLATE_VERSION,
      stage,
      stageVersion: definition.stageVersion,
      analyzerVersion: definition.analyzerVersion,
      promptVersion: definition.promptVersion,
      model: definition.model,
      configurationHash: definition.configurationHash,
      inputHash,
    }
    const id = checkpointId(identity)
    const existing = await this.load(id)
    if (
      existing &&
      sameIdentity(existing, identity) &&
      existing.status === 'completed' &&
      existing.result !== null &&
      existing.resultHash === hashCheckpointResult(existing.result) &&
      validator(existing.result)
    ) {
      logger.info('Pipeline checkpoint reused', { stage, checkpointId: id })
      return {
        value: structuredClone(existing.result),
        resultHash: existing.resultHash,
        reused: true,
      }
    }
    if (existing) await this.remove(id, stage)

    const createdAt = this.now()
    await this.persist({
      ...identity,
      id,
      schemaVersion: PIPELINE_CHECKPOINT_SCHEMA_VERSION,
      resultHash: null,
      result: null,
      status: 'running',
      error: null,
      createdAt,
      updatedAt: createdAt,
    })

    try {
      const value = await operation()
      if (!validator(value))
        throw new TypeError(`A etapa ${stage} retornou resultado inválido.`)
      const resultHash = hashCheckpointResult(value)
      const updatedAt = this.now()
      await this.persist({
        ...identity,
        id,
        schemaVersion: PIPELINE_CHECKPOINT_SCHEMA_VERSION,
        resultHash,
        result: structuredClone(value),
        status: 'completed',
        error: null,
        createdAt,
        updatedAt,
      })
      return { value, resultHash, reused: false }
    } catch (error: unknown) {
      const updatedAt = this.now()
      await this.persist({
        ...identity,
        id,
        schemaVersion: PIPELINE_CHECKPOINT_SCHEMA_VERSION,
        resultHash: null,
        result: null,
        status: 'failed',
        error: safeError(error),
        createdAt,
        updatedAt,
      })
      throw error
    }
  }

  private async load(id: string): Promise<PipelineCheckpoint | null> {
    try {
      return await this.repository.getById(id)
    } catch {
      logger.warn('Pipeline checkpoint could not be read', {
        checkpointId: id,
      })
      return null
    }
  }

  private async persist(checkpoint: PipelineCheckpoint): Promise<void> {
    try {
      await this.repository.save(checkpoint)
    } catch {
      logger.warn('Pipeline checkpoint could not be persisted', {
        checkpointId: checkpoint.id,
        stage: checkpoint.stage,
        status: checkpoint.status,
      })
    }
  }

  private async remove(
    id: string,
    stage: PipelineCheckpointStage,
  ): Promise<void> {
    try {
      await this.repository.delete(id)
    } catch {
      logger.warn('Invalid pipeline checkpoint could not be removed', {
        checkpointId: id,
        stage,
      })
    }
  }
}
