import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it, vi } from 'vitest'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { SqlitePipelineCheckpointRepository } from '../../repositories/checkpoints/sqlite-pipeline-checkpoint.repository'
import type {
  DocumentRepresentation,
  ExtractedParagraph,
} from '../documents/types'
import { ReportGenerationPlanner } from '../reports/report-generation-planner'
import { ReportGenerationPipeline } from '../reports/report-generation.pipeline'
import { buildUserInformationExtractionPrompt } from '../ai/prompts/user-information-extraction.prompt'
import { recoverLegacyReportUnit } from './legacy-report-unit'
import { createProductionReportTemplateCreationContainer } from './report-template.container'
import { hashCheckpointResult } from './pipeline-checkpoint.hash'

const labels = ['Contexto', 'Execução', 'Encerramento']
const information = {
  facts: [],
  activities: [
    {
      description: 'Organizei os livros.',
      evidence: ['Organizei os livros.'],
      procedures: [],
      result: null,
      problems: [],
    },
  ],
}

function fixture() {
  const template = createRichReportTemplate('legacy-archive')
  template.structurePattern.sections = Array.from(
    { length: 22 },
    (_, index) => ({
      name: `Período ${index}`,
      order: index + 1,
      level: 1,
      purpose: 'Atividades do exemplo histórico.',
      required: true,
      repeatable: false,
      children: [],
    }),
  )
  template.structurePattern.hierarchy = [...template.structurePattern.sections]
  const paragraphs: ExtractedParagraph[] = []
  for (const section of template.structurePattern.sections) {
    const append = (text: string, heading = false) =>
      paragraphs.push({
        id: `p${paragraphs.length}`,
        order: paragraphs.length + 1,
        text,
        sectionId: section.name,
        style: heading ? 'heading' : 'paragraph',
        headingLevel: heading ? 1 : null,
        numbering: null,
        pageBreakBefore: false,
        formatting: {
          ...template.formattingPattern.headingStyles[0]!.formatting,
          alignment: 'both',
        },
      })
    append(section.name, true)
    for (const label of labels) {
      append(label)
      append(
        'O documento anterior descreve a execução de uma atividade, com informações históricas que não devem ser reutilizadas como fatos no novo relatório.',
      )
    }
  }
  const document: DocumentRepresentation = {
    fileName: 'collection.docx',
    fileType: 'docx',
    text: paragraphs.map((p) => p.text).join('\n'),
    metadata: {
      fileSize: 1,
      extractedAt: '2026-01-01T00:00:00.000Z',
      title: null,
      author: null,
      createdAt: null,
      modifiedAt: null,
    },
    paragraphs,
    sections: template.structurePattern.sections.map((section) => ({
      id: section.name,
      title: section.name,
      level: 1,
      order: section.order,
      parentSectionId: null,
      content: '',
    })),
    elements: [],
    headings: [],
    tables: [],
    figures: [],
    lists: [],
    headers: [],
    footers: [],
    styles: [],
    formatting: { defaultParagraph: {} },
    pageInformation: {
      widthPt: 595,
      heightPt: 842,
      orientation: 'portrait',
      margins: { topPt: 72, rightPt: 72, bottomPt: 72, leftPt: 72 },
      hasPageNumbering: false,
      pageBreakCount: 0,
    },
  }
  return { template, document }
}

async function verifyProductionRead(
  template: ReportTemplate,
  document: unknown,
) {
  const directory = mkdtempSync(path.join(tmpdir(), 'siear-legacy-unit-'))
  const databasePath = path.join(directory, 'test.sqlite3')
  const container = createProductionReportTemplateCreationContainer(
    { execute: vi.fn() },
    databasePath,
  )
  const checkpoints = new SqlitePipelineCheckpointRepository(databasePath)
  try {
    await container.repository.create(template)
    for (const [stage, result] of [
      ['extraction', document],
      ['consolidation', template],
    ] as const) {
      await checkpoints.save({
        id: stage,
        schemaVersion: 1,
        templateVersion: 2,
        documentHash: 'source-hash',
        stage,
        stageVersion: '1',
        analyzerVersion: '1',
        promptVersion: '1',
        configurationHash: 'config',
        inputHash: 'input',
        model: 'test',
        result,
        resultHash: hashCheckpointResult(result),
        status: 'completed',
        error: null,
        createdAt: '2026-01-01T00:00:00.000Z',
        updatedAt: '2026-01-01T00:00:00.000Z',
      })
    }
    const loaded = (await container.service.getById(template.metadata.id))!
    const listed = (await container.service.getAll())[0]!
    expect(loaded.structurePattern.reportUnit?.sections).toHaveLength(3)
    expect(listed.structurePattern.reportUnit).toEqual(
      loaded.structurePattern.reportUnit,
    )
    expect(
      (await container.repository.getById(template.metadata.id))!
        .structurePattern.reportUnit,
    ).toBeUndefined()
    const writer = {
      generate: vi.fn().mockResolvedValue({ id: 'report', sections: [] }),
    }
    const pipeline = new ReportGenerationPipeline(
      { extract: vi.fn().mockResolvedValue(structuredClone(information)) },
      new ReportGenerationPlanner(),
      writer,
    )
    await pipeline.generate('Organizei os livros.', loaded)
    expect(writer.generate).toHaveBeenCalledOnce()
    const plan = writer.generate.mock.calls[0]![1]
    expect(plan.sections).toHaveLength(3)
    expect(plan.missing).toEqual([])
    expect(
      plan.sections.every(
        (section: { sectionName: string }) =>
          !/^Sprint|^Período/.test(section.sectionName),
      ),
    ).toBe(true)
    expect(
      buildUserInformationExtractionPrompt('Organizei os livros.', loaded),
    ).not.toContain('Sprint 19')
    return loaded
  } finally {
    checkpoints.close()
    container.repository.close()
    rmSync(directory, { recursive: true, force: true })
  }
}

describe('compatibilidade com compilados antigos', () => {
  it('recupera uma unidade ao listar e gerar sem alterar o modelo salvo', async () => {
    const { template, document } = fixture()
    const recovered = await verifyProductionRead(template, document)
    expect(
      recovered.structurePattern.reportUnit?.sections.map(
        (section) => section.name,
      ),
    ).toEqual(labels)
    expect(recovered.formattingPattern.docxLayout).toBeUndefined()
  })

  it('não reduz um documento comum só porque tem 22 capítulos numerados', async () => {
    const { template, document } = fixture()
    document.paragraphs = document.paragraphs.filter(
      (p) => p.headingLevel !== null,
    )
    const recovered = await recoverLegacyReportUnit(
      template,
      async () => document,
    )
    expect(recovered).toBe(template)
    expect(
      new ReportGenerationPlanner().plan(information, recovered).sections,
    ).toHaveLength(22)
  })

  it('não aplica extração antiga sobre seções editadas nem sobre outro modelo', async () => {
    const { template, document } = fixture()
    template.structurePattern.sections[0]!.name = 'Introdução editada'
    expect(await recoverLegacyReportUnit(template, async () => document)).toBe(
      template,
    )
    expect(await recoverLegacyReportUnit(template, async () => null)).toBe(
      template,
    )
  })

  it('não precisa do arquivo DOCX nem chama IA para recuperar a unidade', async () => {
    const { template, document } = fixture()
    const find = vi.fn().mockResolvedValue(document)
    const recovered = await recoverLegacyReportUnit(template, find)
    expect(find).toHaveBeenCalledWith(template.metadata.id)
    expect(recovered.structurePattern.reportUnit?.instances).toBe(22)
  })

  it.skipIf(!process.env.SIEAR_SOURCE_DATABASE)(
    'reproduz o modelo legado real em banco temporário, sem modificar o banco do usuário',
    async () => {
      const db = new DatabaseSync(process.env.SIEAR_SOURCE_DATABASE!, {
        readOnly: true,
      })
      let template: ReportTemplate
      let document: unknown
      try {
        const row = db
          .prepare(
            "SELECT * FROM report_templates WHERE metadata_json LIKE '%Sprint%' ORDER BY updated_at DESC LIMIT 1",
          )
          .get() as Record<string, string>
        template = {
          version: 2,
          metadata: JSON.parse(row.metadata_json!),
          structurePattern: JSON.parse(row.structure_pattern_json!),
          writingPattern: JSON.parse(row.writing_pattern_json!),
          semanticPattern: JSON.parse(row.semantic_pattern_json!),
          formattingPattern: JSON.parse(row.formatting_pattern_json!),
          fields: JSON.parse(row.fields_json!),
          activityPatterns: JSON.parse(row.activity_patterns_json!),
          requirements: JSON.parse(row.requirements_json!),
        }
        const source = db
          .prepare(
            `SELECT e.result_json FROM pipeline_checkpoints c JOIN pipeline_checkpoints e ON c.document_hash=e.document_hash WHERE c.stage='consolidation' AND e.stage='extraction' AND c.status='completed' AND e.status='completed' AND json_extract(c.result_json, '$.metadata.id')=? ORDER BY e.updated_at DESC LIMIT 1`,
          )
          .get(template.metadata.id) as { result_json: string }
        document = JSON.parse(source.result_json)
      } finally {
        db.close()
      }
      expect(template.formattingPattern.docxLayout).toBeUndefined()
      expect(template.structurePattern.sections).toHaveLength(22)
      const loaded = await verifyProductionRead(template, document)
      expect(
        loaded.structurePattern.reportUnit?.sections.map(
          (section) => section.name,
        ),
      ).toEqual([
        'Descrição da atividade',
        'Justificativa da atividade',
        'Resultado Obtido na atividade',
      ])
    },
  )
})
