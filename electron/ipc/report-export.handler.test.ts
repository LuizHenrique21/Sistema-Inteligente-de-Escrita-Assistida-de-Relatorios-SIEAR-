import { readFile, rm, writeFile, mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { GeneratedReport } from '../../src/types/generated-report'
import { DocumentRenderer } from '../services/documents/document-renderer'
import { createRichReportTemplate } from '../testing/report-template.fixture'
import { createReportExportHandler } from './report-export.handler'

const template = createRichReportTemplate('template-export')
const report: GeneratedReport = {
  id: 'report-export',
  templateId: template.metadata.id,
  templateName: template.metadata.name,
  createdAt: '2026-08-23T12:00:00.000Z',
  sections: [
    {
      id: '2:execucao',
      name: 'Execução',
      order: 2,
      content: 'Foi realizada a substituição do componente.',
      elements: [
        {
          type: 'paragraph',
          content: 'Foi realizada a substituição do componente.',
        },
        {
          type: 'table',
          headerRows: 1,
          rows: [
            ['Campo', 'Valor'],
            ['Equipamento', 'Notebook'],
          ],
        },
      ],
    },
  ],
}

describe('exportação oficial ReportTemplate → GeneratedReport → DOCX', () => {
  let directory: string
  let destination: string

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'siear-export-'))
    destination = path.join(directory, 'relatorio.docx')
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('busca o template rico, renderiza e grava o DOCX no backend', async () => {
    const handler = createReportExportHandler(
      { getById: vi.fn().mockResolvedValue(template) },
      new DocumentRenderer(),
      { select: vi.fn().mockResolvedValue(destination) },
      { write: writeFile },
    )

    await expect(handler({ report })).resolves.toEqual({
      success: true,
      filePath: destination,
    })
    const zip = await JSZip.loadAsync(await readFile(destination))
    const documentXml = await zip.file('word/document.xml')!.async('text')
    const stylesXml = await zip.file('word/styles.xml')!.async('text')
    expect(documentXml).toContain('Foi realizada a substituição do componente.')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).toContain('w:top="1440"')
    expect(stylesXml).toContain('Arial')
    expect(stylesXml).toContain('w:sz w:val="26"')
    expect(zip.file('word/settings.xml')).not.toBeNull()
  })

  it('trata cancelamento e não grava arquivo', async () => {
    const files = { write: vi.fn() }
    const handler = createReportExportHandler(
      { getById: vi.fn().mockResolvedValue(template) },
      new DocumentRenderer(),
      { select: vi.fn().mockResolvedValue(null) },
      files,
    )
    await expect(handler({ report })).resolves.toMatchObject({
      success: false,
      error: { code: 'CANCELED' },
    })
    expect(files.write).not.toHaveBeenCalled()
  })

  it('rejeita relatórios inválidos e templates inexistentes', async () => {
    const dependencies = [
      new DocumentRenderer(),
      { select: vi.fn() },
      { write: vi.fn() },
    ] as const
    const invalid = createReportExportHandler(
      { getById: vi.fn() },
      ...dependencies,
    )
    await expect(invalid({ report: { id: '' } })).resolves.toMatchObject({
      success: false,
      error: { code: 'INVALID_REQUEST' },
    })
    const missing = createReportExportHandler(
      { getById: vi.fn().mockResolvedValue(null) },
      ...dependencies,
    )
    await expect(missing({ report })).resolves.toMatchObject({
      success: false,
      error: { code: 'TEMPLATE_NOT_FOUND' },
    })
  })
})
