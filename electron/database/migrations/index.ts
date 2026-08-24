import { createReportTemplatesMigration } from './001-create-report-templates'
import { createPipelineCheckpointsMigration } from './002-create-pipeline-checkpoints'
import type { DatabaseMigration } from './migration'

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  createReportTemplatesMigration,
  createPipelineCheckpointsMigration,
]
