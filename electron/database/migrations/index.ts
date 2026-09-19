import { createReportTemplatesMigration } from './001-create-report-templates'
import type { DatabaseMigration } from './migration'

export const DATABASE_MIGRATIONS: readonly DatabaseMigration[] = [
  createReportTemplatesMigration,
]
