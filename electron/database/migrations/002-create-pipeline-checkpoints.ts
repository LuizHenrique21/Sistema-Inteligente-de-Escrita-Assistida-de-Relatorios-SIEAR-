import type { DatabaseMigration } from './migration'

export const createPipelineCheckpointsMigration: DatabaseMigration = {
  version: 2,
  name: 'create_pipeline_checkpoints',
  sql: `
    CREATE TABLE pipeline_checkpoints (
      id TEXT PRIMARY KEY NOT NULL,
      schema_version INTEGER NOT NULL,
      document_hash TEXT NOT NULL,
      template_version INTEGER NOT NULL,
      stage TEXT NOT NULL CHECK (stage IN (
        'extraction', 'structure', 'writing', 'semantic', 'formatting',
        'consolidation'
      )),
      stage_version TEXT NOT NULL,
      analyzer_version TEXT NOT NULL,
      prompt_version TEXT NOT NULL,
      model TEXT NOT NULL,
      configuration_hash TEXT NOT NULL,
      input_hash TEXT NOT NULL,
      result_hash TEXT,
      result_json TEXT CHECK (result_json IS NULL OR json_valid(result_json)),
      status TEXT NOT NULL CHECK (status IN ('running', 'completed', 'failed')),
      error_json TEXT CHECK (error_json IS NULL OR json_valid(error_json)),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      CHECK (
        (status = 'completed' AND result_hash IS NOT NULL AND result_json IS NOT NULL AND error_json IS NULL)
        OR
        (status IN ('running', 'failed') AND result_hash IS NULL AND result_json IS NULL)
      )
    ) STRICT;

    CREATE INDEX pipeline_checkpoints_document_stage_idx
      ON pipeline_checkpoints(document_hash, stage);
  `,
}
