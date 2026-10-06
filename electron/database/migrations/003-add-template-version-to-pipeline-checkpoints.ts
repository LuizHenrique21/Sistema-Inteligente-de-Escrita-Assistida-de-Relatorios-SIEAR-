import type { DatabaseMigration } from './migration'

// Databases created by an earlier development build already recorded migration
// 002, but their table predates the template_version column used by checkpoints.
export const addTemplateVersionToPipelineCheckpointsMigration: DatabaseMigration = {
  version: 3,
  name: 'add_template_version_to_pipeline_checkpoints',
  sql: `
    ALTER TABLE pipeline_checkpoints
      ADD COLUMN template_version INTEGER NOT NULL DEFAULT 1;
  `,
}
