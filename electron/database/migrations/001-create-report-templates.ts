import type { DatabaseMigration } from './migration'

export const createReportTemplatesMigration: DatabaseMigration = {
  version: 1,
  name: 'create_report_templates',
  sql: `
    CREATE TABLE report_templates (
      id TEXT PRIMARY KEY NOT NULL,
      version INTEGER NOT NULL,
      metadata_json TEXT NOT NULL CHECK (json_valid(metadata_json)),
      structure_pattern_json TEXT NOT NULL CHECK (json_valid(structure_pattern_json)),
      fields_json TEXT NOT NULL CHECK (json_valid(fields_json)),
      activity_patterns_json TEXT NOT NULL CHECK (json_valid(activity_patterns_json)),
      requirements_json TEXT NOT NULL CHECK (json_valid(requirements_json)),
      writing_pattern_json TEXT NOT NULL CHECK (json_valid(writing_pattern_json)),
      formatting_pattern_json TEXT NOT NULL CHECK (json_valid(formatting_pattern_json)),
      semantic_pattern_json TEXT NOT NULL CHECK (json_valid(semantic_pattern_json)),
      status TEXT NOT NULL CHECK (status IN ('draft', 'confirmed')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    ) STRICT;

    CREATE INDEX report_templates_created_at_idx
      ON report_templates(created_at, id);
  `,
}
