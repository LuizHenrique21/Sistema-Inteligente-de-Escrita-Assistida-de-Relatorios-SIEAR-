import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { ReportTemplateService } from '../../services/templates/report-template.service'
import { ReportTemplateRepositoryError } from './report-template.repository'
import { SqliteReportTemplateRepository } from './sqlite-report-template.repository'

describe('SqliteReportTemplateRepository', () => {
  let directory: string
  let databasePath: string
  let repository: SqliteReportTemplateRepository

  beforeEach(() => {
    directory = mkdtempSync(path.join(tmpdir(), 'siear-sqlite-'))
    databasePath = path.join(directory, 'templates.sqlite3')
    repository = new SqliteReportTemplateRepository(databasePath)
  })

  afterEach(() => {
    repository.close()
    rmSync(directory, { recursive: true, force: true })
  })

  it('aplica a migration uma única vez em banco limpo', () => {
    repository.close()
    const database = new DatabaseSync(databasePath)
    const migrations = database
      .prepare('SELECT version, name FROM schema_migrations ORDER BY version')
      .all()
    const table = database
      .prepare(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'report_templates'",
      )
      .get()
    database.close()

    expect(migrations).toEqual([
      { version: 1, name: 'create_report_templates' },
      { version: 2, name: 'create_pipeline_checkpoints' },
    ])
    expect(table).toEqual({ name: 'report_templates' })

    repository = new SqliteReportTemplateRepository(databasePath)
  })

  it('preserva profundamente todos os objetos ricos após reinício', async () => {
    const template = createRichReportTemplate()
    await repository.create(template)
    repository.close()

    repository = new SqliteReportTemplateRepository(databasePath)
    const restored = await repository.getById(template.metadata.id)

    expect(restored).toEqual(template)
    expect(restored?.fields[0]?.evidence[0]).toEqual(
      template.fields[0]?.evidence[0],
    )
    expect(restored?.semanticPattern.sections[0]?.relationships[0]).toEqual(
      template.semanticPattern.sections[0]?.relationships[0],
    )
    expect(restored?.formattingPattern.headingStyles[0]).toEqual(
      template.formattingPattern.headingStyles[0],
    )
  })

  it('executa create, getAll, update e delete', async () => {
    const first = createRichReportTemplate('first')
    const second = createRichReportTemplate('second')
    await repository.create(first)
    await repository.create(second)

    await expect(repository.getAll()).resolves.toEqual([first, second])

    const updated = structuredClone(first)
    updated.metadata.name = 'Modelo atualizado'
    updated.metadata.updatedAt = '2026-08-21T13:00:00.000Z'
    await expect(repository.update(updated)).resolves.toEqual(updated)
    await expect(repository.getById('first')).resolves.toEqual(updated)

    await repository.delete('first')
    await expect(repository.getById('first')).resolves.toBeNull()
  })

  it('preserva regras de confirmação e timestamps no service', async () => {
    const times = ['2026-08-22T10:00:00.000Z', '2026-08-22T11:00:00.000Z']
    const service = new ReportTemplateService(
      repository,
      () => times.shift() ?? '2026-08-22T12:00:00.000Z',
    )

    const created = await service.create(createRichReportTemplate())
    expect(created.metadata).toMatchObject({
      status: 'draft',
      createdAt: '2026-08-22T10:00:00.000Z',
      updatedAt: '2026-08-22T10:00:00.000Z',
    })

    const confirmed = await service.confirm(created.metadata.id)
    expect(confirmed.metadata).toMatchObject({
      status: 'confirmed',
      createdAt: '2026-08-22T10:00:00.000Z',
      updatedAt: '2026-08-22T11:00:00.000Z',
    })
  })

  it('traduz IDs duplicados e updates ausentes em erros controlados', async () => {
    const template = createRichReportTemplate()
    await repository.create(template)
    await expect(repository.create(template)).rejects.toMatchObject({
      code: 'DUPLICATE_ID',
    } satisfies Partial<ReportTemplateRepositoryError>)

    const missing = createRichReportTemplate('missing')
    await expect(repository.update(missing)).rejects.toMatchObject({
      code: 'NOT_FOUND',
    } satisfies Partial<ReportTemplateRepositoryError>)
  })
})
