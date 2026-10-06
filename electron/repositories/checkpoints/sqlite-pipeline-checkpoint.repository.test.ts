import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import {
  PIPELINE_CHECKPOINT_SCHEMA_VERSION,
  type PipelineCheckpoint,
} from '../../services/templates/pipeline-checkpoint.types'
import { SqlitePipelineCheckpointRepository } from './sqlite-pipeline-checkpoint.repository'

function checkpoint(): PipelineCheckpoint {
  return {
    id: 'checkpoint-1',
    schemaVersion: PIPELINE_CHECKPOINT_SCHEMA_VERSION,
    documentHash: 'document-hash',
    templateVersion: 2,
    stage: 'structure',
    stageVersion: '1',
    analyzerVersion: '1',
    promptVersion: '1',
    model: 'qwen3:8b',
    configurationHash: 'configuration-hash',
    inputHash: 'input-hash',
    resultHash: 'result-hash',
    result: { documentType: 'Relatório', sections: [] },
    status: 'completed',
    error: null,
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:01:00.000Z',
  }
}

describe('SqlitePipelineCheckpointRepository', () => {
  let directory: string
  let databasePath: string
  let repository: SqlitePipelineCheckpointRepository

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'siear-checkpoints-'))
    databasePath = path.join(directory, 'checkpoints.sqlite3')
    repository = new SqlitePipelineCheckpointRepository(databasePath)
  })

  afterEach(() => {
    repository.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('aplica a migration no mesmo banco de templates', () => {
    repository.close()
    const database = new DatabaseSync(databasePath)
    const migrations = database
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all()
    const tables = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('report_templates', 'pipeline_checkpoints') ORDER BY name",
      )
      .all()
    database.close()

    expect(migrations).toEqual([
      { version: 1, name: 'create_report_templates' },
      { version: 2, name: 'create_pipeline_checkpoints' },
      { version: 3, name: 'add_template_version_to_pipeline_checkpoints' },
    ])
    expect(tables).toEqual([
      { name: 'pipeline_checkpoints' },
      { name: 'report_templates' },
    ])
    repository = new SqlitePipelineCheckpointRepository(databasePath)
  })

  it('atualiza bancos legados que ainda não possuem template_version', () => {
    repository.close()
    const database = new DatabaseSync(databasePath)
    database.exec('DROP TABLE pipeline_checkpoints')
    database
      .prepare('DELETE FROM schema_migrations WHERE version = ?')
      .run(3)
    database.exec(`
      CREATE TABLE pipeline_checkpoints (
        id TEXT PRIMARY KEY NOT NULL,
        schema_version INTEGER NOT NULL,
        document_hash TEXT NOT NULL,
        stage TEXT NOT NULL,
        stage_version TEXT NOT NULL,
        analyzer_version TEXT NOT NULL,
        prompt_version TEXT NOT NULL,
        model TEXT NOT NULL,
        configuration_hash TEXT NOT NULL,
        input_hash TEXT NOT NULL,
        result_hash TEXT,
        result_json TEXT,
        status TEXT NOT NULL,
        error_json TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      ) STRICT;
    `)
    database.close()

    repository = new SqlitePipelineCheckpointRepository(databasePath)
    repository.close()
    const upgraded = new DatabaseSync(databasePath)
    const columns = upgraded
      .prepare('PRAGMA table_info(pipeline_checkpoints)')
      .all() as Array<{ name: string; notnull: number; dflt_value: string | null }>
    upgraded.close()

    expect(columns).toContainEqual(
      expect.objectContaining({
        name: 'template_version',
        notnull: 1,
        dflt_value: '1',
      }),
    )
    repository = new SqlitePipelineCheckpointRepository(databasePath)
  })

  it('preserva profundamente um checkpoint após reinício', async () => {
    const value = checkpoint()
    await repository.save(value)
    repository.close()
    repository = new SqlitePipelineCheckpointRepository(databasePath)

    const restored = await repository.getById(value.id)

    expect(restored).toEqual(value)
    if (
      typeof restored?.result !== 'object' ||
      restored.result === null ||
      !('sections' in restored.result)
    )
      throw new Error('Resultado restaurado inválido.')
    expect(restored.result.sections).toEqual([])
  })

  it('faz upsert de running para completed sem resultado parcial válido', async () => {
    const completed = checkpoint()
    const running: PipelineCheckpoint = {
      ...completed,
      result: null,
      resultHash: null,
      status: 'running',
      updatedAt: completed.createdAt,
    }
    await repository.save(running)
    await expect(repository.getById(running.id)).resolves.toEqual(running)

    await repository.save(completed)

    await expect(repository.getById(completed.id)).resolves.toEqual(completed)
  })

  it('rejeita completed sem resultado e hash', async () => {
    const partial: PipelineCheckpoint = {
      ...checkpoint(),
      result: null,
      resultHash: null,
    }

    await expect(repository.save(partial)).rejects.toThrow()
  })

  it('remove checkpoint por id', async () => {
    const value = checkpoint()
    await repository.save(value)

    await repository.delete(value.id)

    await expect(repository.getById(value.id)).resolves.toBeNull()
  })
})
