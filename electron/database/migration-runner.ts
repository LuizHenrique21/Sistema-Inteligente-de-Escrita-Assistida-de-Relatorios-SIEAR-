import type { DatabaseSync } from 'node:sqlite'
import type { DatabaseMigration } from './migrations/migration'

interface MigrationRow {
  version: number
}

export function runMigrations(
  database: DatabaseSync,
  migrations: readonly DatabaseMigration[],
): void {
  database.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY NOT NULL,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    ) STRICT;
  `)

  const appliedRows = database
    .prepare('SELECT version FROM schema_migrations')
    .all() as unknown as MigrationRow[]
  const appliedVersions = new Set(appliedRows.map((row) => row.version))
  const insertMigration = database.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)',
  )

  for (const migration of [...migrations].sort(
    (first, second) => first.version - second.version,
  )) {
    if (appliedVersions.has(migration.version)) continue

    database.exec('BEGIN IMMEDIATE')
    try {
      database.exec(migration.sql)
      insertMigration.run(
        migration.version,
        migration.name,
        new Date().toISOString(),
      )
      database.exec('COMMIT')
    } catch (error: unknown) {
      database.exec('ROLLBACK')
      throw error
    }
  }
}
