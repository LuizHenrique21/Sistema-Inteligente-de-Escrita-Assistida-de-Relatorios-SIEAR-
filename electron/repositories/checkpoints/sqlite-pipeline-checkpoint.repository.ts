import { DatabaseSync } from 'node:sqlite'
import { DATABASE_MIGRATIONS } from '../../database/migrations'
import { runMigrations } from '../../database/migration-runner'
import { getLogger } from '../../infrastructure/logging/logger.runtime'
import {
  PIPELINE_CHECKPOINT_SCHEMA_VERSION,
  PIPELINE_CHECKPOINT_STAGES,
  type PipelineCheckpoint,
  type PipelineCheckpointRepository,
  type PipelineCheckpointStage,
  type PipelineCheckpointStatus,
  type SafeCheckpointError,
} from '../../services/templates/pipeline-checkpoint.types'

const logger = getLogger('SqlitePipelineCheckpointRepository')
const CHECKPOINT_STATUSES = new Set<PipelineCheckpointStatus>([
  'running',
  'completed',
  'failed',
])

interface PipelineCheckpointRow {
  id: string
  schema_version: number
  document_hash: string
  template_version: number
  stage: string
  stage_version: string
  analyzer_version: string
  prompt_version: string
  model: string
  configuration_hash: string
  input_hash: string
  result_hash: string | null
  result_json: string | null
  status: string
  error_json: string | null
  created_at: string
  updated_at: string
}

function isStage(value: string): value is PipelineCheckpointStage {
  return PIPELINE_CHECKPOINT_STAGES.some((stage) => stage === value)
}

function parseError(value: string | null): SafeCheckpointError | null {
  if (value === null) return null
  const parsed: unknown = JSON.parse(value)
  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !('name' in parsed) ||
    typeof parsed.name !== 'string' ||
    !('code' in parsed) ||
    (parsed.code !== null && typeof parsed.code !== 'string')
  ) {
    throw new Error('Checkpoint persistido contém erro inválido.')
  }
  return { name: parsed.name, code: parsed.code }
}

function checkpointFromRow(row: PipelineCheckpointRow): PipelineCheckpoint {
  if (
    row.schema_version !== PIPELINE_CHECKPOINT_SCHEMA_VERSION ||
    !isStage(row.stage) ||
    !CHECKPOINT_STATUSES.has(row.status as PipelineCheckpointStatus)
  ) {
    throw new Error('Checkpoint persistido possui contrato incompatível.')
  }
  return {
    id: row.id,
    schemaVersion: PIPELINE_CHECKPOINT_SCHEMA_VERSION,
    documentHash: row.document_hash,
    templateVersion: row.template_version,
    stage: row.stage,
    stageVersion: row.stage_version,
    analyzerVersion: row.analyzer_version,
    promptVersion: row.prompt_version,
    model: row.model,
    configurationHash: row.configuration_hash,
    inputHash: row.input_hash,
    resultHash: row.result_hash,
    result: row.result_json === null ? null : (JSON.parse(row.result_json) as unknown),
    status: row.status as PipelineCheckpointStatus,
    error: parseError(row.error_json),
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  }
}

function serializeOptional(value: unknown | null): string | null {
  if (value === null) return null
  const serialized = JSON.stringify(value)
  if (serialized === undefined)
    throw new TypeError('O checkpoint contém valor não serializável.')
  return serialized
}

export class SqlitePipelineCheckpointRepository
  implements PipelineCheckpointRepository
{
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath)
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    runMigrations(this.database, DATABASE_MIGRATIONS)
    logger.info('Pipeline checkpoint database initialized')
  }

  async getById(id: string): Promise<PipelineCheckpoint | null> {
    const row = this.database
      .prepare('SELECT * FROM pipeline_checkpoints WHERE id = ?')
      .get(id) as unknown as PipelineCheckpointRow | undefined
    return row ? checkpointFromRow(row) : null
  }

  async save(checkpoint: PipelineCheckpoint): Promise<void> {
    this.database
      .prepare(
        `
        INSERT INTO pipeline_checkpoints (
          id, schema_version, document_hash, template_version, stage, stage_version,
          analyzer_version, prompt_version, model, configuration_hash,
          input_hash, result_hash, result_json, status, error_json,
          created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          schema_version = excluded.schema_version,
          document_hash = excluded.document_hash,
          template_version = excluded.template_version,
          stage = excluded.stage,
          stage_version = excluded.stage_version,
          analyzer_version = excluded.analyzer_version,
          prompt_version = excluded.prompt_version,
          model = excluded.model,
          configuration_hash = excluded.configuration_hash,
          input_hash = excluded.input_hash,
          result_hash = excluded.result_hash,
          result_json = excluded.result_json,
          status = excluded.status,
          error_json = excluded.error_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `,
      )
      .run(
        checkpoint.id,
        checkpoint.schemaVersion,
        checkpoint.documentHash,
        checkpoint.templateVersion,
        checkpoint.stage,
        checkpoint.stageVersion,
        checkpoint.analyzerVersion,
        checkpoint.promptVersion,
        checkpoint.model,
        checkpoint.configurationHash,
        checkpoint.inputHash,
        checkpoint.resultHash,
        serializeOptional(checkpoint.result),
        checkpoint.status,
        serializeOptional(checkpoint.error),
        checkpoint.createdAt,
        checkpoint.updatedAt,
      )
  }

  async delete(id: string): Promise<void> {
    this.database
      .prepare('DELETE FROM pipeline_checkpoints WHERE id = ?')
      .run(id)
  }

  close(): void {
    this.database.close()
  }
}
