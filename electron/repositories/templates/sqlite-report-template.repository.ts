import { DatabaseSync } from 'node:sqlite'
import {
  REPORT_TEMPLATE_VERSION,
  type ReportTemplate,
} from '../../../src/domain/templates/report-template'
import { DATABASE_MIGRATIONS } from '../../database/migrations'
import { runMigrations } from '../../database/migration-runner'
import { isReportTemplate } from '../../services/templates/report-template.validation'
import {
  ReportTemplateRepositoryError,
  type ReportTemplateRepository,
} from './report-template.repository'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('SqliteReportTemplateRepository')

interface ReportTemplateRow {
  id: string
  version: number
  metadata_json: string
  structure_pattern_json: string
  fields_json: string
  activity_patterns_json: string
  requirements_json: string
  writing_pattern_json: string
  formatting_pattern_json: string
  semantic_pattern_json: string
}

function validateTemplate(template: ReportTemplate): void {
  if (
    template.version !== REPORT_TEMPLATE_VERSION ||
    !isReportTemplate(template)
  ) {
    throw new ReportTemplateRepositoryError(
      'VALIDATION_ERROR',
      'A estrutura do modelo é inválida.',
    )
  }
}

function parseJson(value: string): unknown {
  return JSON.parse(value) as unknown
}

function templateFromRow(row: ReportTemplateRow): ReportTemplate {
  const template: unknown = {
    version: row.version,
    metadata: parseJson(row.metadata_json),
    structurePattern: parseJson(row.structure_pattern_json),
    fields: parseJson(row.fields_json),
    activityPatterns: parseJson(row.activity_patterns_json),
    requirements: parseJson(row.requirements_json),
    writingPattern: parseJson(row.writing_pattern_json),
    formattingPattern: parseJson(row.formatting_pattern_json),
    semanticPattern: parseJson(row.semantic_pattern_json),
  }

  if (!isReportTemplate(template)) {
    throw new ReportTemplateRepositoryError(
      'VALIDATION_ERROR',
      `O modelo persistido com ID "${row.id}" é inválido.`,
    )
  }
  return structuredClone(template)
}

function values(template: ReportTemplate): readonly (string | number)[] {
  return [
    template.metadata.id,
    template.version,
    JSON.stringify(template.metadata),
    JSON.stringify(template.structurePattern),
    JSON.stringify(template.fields),
    JSON.stringify(template.activityPatterns),
    JSON.stringify(template.requirements),
    JSON.stringify(template.writingPattern),
    JSON.stringify(template.formattingPattern),
    JSON.stringify(template.semanticPattern),
    template.metadata.status,
    template.metadata.createdAt,
    template.metadata.updatedAt,
  ]
}

function duplicateId(error: unknown): boolean {
  return (
    error instanceof Error && /UNIQUE constraint failed/i.test(error.message)
  )
}

export class SqliteReportTemplateRepository implements ReportTemplateRepository {
  private readonly database: DatabaseSync

  constructor(databasePath: string) {
    this.database = new DatabaseSync(databasePath)
    this.database.exec('PRAGMA foreign_keys = ON; PRAGMA busy_timeout = 5000;')
    runMigrations(this.database, DATABASE_MIGRATIONS)
    logger.info('Template database initialized')
  }

  async create(template: ReportTemplate): Promise<ReportTemplate> {
    logger.debug('Repository create', { templateId: template.metadata.id })
    validateTemplate(template)
    try {
      this.database
        .prepare(
          `
          INSERT INTO report_templates (
            id, version, metadata_json, structure_pattern_json, fields_json,
            activity_patterns_json, requirements_json, writing_pattern_json,
            formatting_pattern_json, semantic_pattern_json, status,
            created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
        )
        .run(...values(template))
    } catch (error: unknown) {
      if (duplicateId(error)) {
        throw new ReportTemplateRepositoryError(
          'DUPLICATE_ID',
          `Já existe um modelo com o ID "${template.metadata.id}".`,
        )
      }
      throw error
    }
    return structuredClone(template)
  }

  async getById(id: string): Promise<ReportTemplate | null> {
    logger.debug('Repository getById', { templateId: id })
    const row = this.database
      .prepare('SELECT * FROM report_templates WHERE id = ?')
      .get(id) as unknown as ReportTemplateRow | undefined
    if (!row) logger.warn('Repository entity not found', { templateId: id })
    return row ? templateFromRow(row) : null
  }

  async getAll(): Promise<ReportTemplate[]> {
    logger.debug('Repository getAll')
    const rows = this.database
      .prepare('SELECT * FROM report_templates ORDER BY created_at, id')
      .all() as unknown as ReportTemplateRow[]
    return rows.map(templateFromRow)
  }

  async update(template: ReportTemplate): Promise<ReportTemplate> {
    logger.debug('Repository update', { templateId: template.metadata.id })
    validateTemplate(template)
    const result = this.database
      .prepare(
        `
        UPDATE report_templates SET
          version = ?, metadata_json = ?, structure_pattern_json = ?,
          fields_json = ?, activity_patterns_json = ?, requirements_json = ?,
          writing_pattern_json = ?, formatting_pattern_json = ?,
          semantic_pattern_json = ?, status = ?, created_at = ?, updated_at = ?
        WHERE id = ?
      `,
      )
      .run(
        template.version,
        JSON.stringify(template.metadata),
        JSON.stringify(template.structurePattern),
        JSON.stringify(template.fields),
        JSON.stringify(template.activityPatterns),
        JSON.stringify(template.requirements),
        JSON.stringify(template.writingPattern),
        JSON.stringify(template.formattingPattern),
        JSON.stringify(template.semanticPattern),
        template.metadata.status,
        template.metadata.createdAt,
        template.metadata.updatedAt,
        template.metadata.id,
      )
    if (Number(result.changes) === 0) {
      throw new ReportTemplateRepositoryError(
        'NOT_FOUND',
        `Modelo com o ID "${template.metadata.id}" não encontrado.`,
      )
    }
    return structuredClone(template)
  }

  async delete(id: string): Promise<void> {
    logger.debug('Repository delete', { templateId: id })
    this.database.prepare('DELETE FROM report_templates WHERE id = ?').run(id)
  }

  close(): void {
    this.database.close()
  }
}
