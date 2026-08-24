import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import type { GeneratedReport } from '../../../src/types/generated-report'
import type { FormattingPattern } from '../../../src/domain/templates/formatting-pattern'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { DocumentRenderer } from './document-renderer'
import { DocxExtractor } from './docx-extractor.service'
import type { ParagraphFormatting } from './types'

const normal: ParagraphFormatting = {
  fontFamily: 'Arial',
  fontSizePt: 11,
  bold: false,
  italic: false,
  underline: false,
  alignment: 'justify',
  lineSpacing: 1.15,
  spaceBeforePt: 0,
  spaceAfterPt: 6,
  indentLeftPt: 0,
  indentRightPt: 0,
  firstLineIndentPt: 18,
  styleId: 'Normal',
}
const pattern: FormattingPattern = {
  documentStyle: {
    predominantFont: 'Arial',
    predominantFontSizePt: 11,
    sectionFonts: [
      { sectionName: 'Descrição', fontFamily: 'Arial', fontSizePt: 11 },
      { sectionName: 'Resultado', fontFamily: 'Arial', fontSizePt: 11 },
    ],
    pageWidthPt: 612,
    pageHeightPt: 792,
    orientation: 'portrait',
    margins: { topPt: 72, rightPt: 54, bottomPt: 72, leftPt: 54 },
    hasPageNumbering: true,
    pageBreakCount: 1,
    pageBreakBeforeSections: ['Resultado'],
  },
  headingStyles: [
    {
      level: 1,
      sectionNames: ['Descrição'],
      sourceStyleId: 'Heading1',
      formatting: {
        ...normal,
        fontSizePt: 16,
        bold: true,
        alignment: 'center',
        firstLineIndentPt: 0,
      },
      evidence: { elementIds: ['h1'], occurrences: 1 },
    },
    {
      level: 2,
      sectionNames: ['Resultado'],
      sourceStyleId: 'Heading2',
      formatting: {
        ...normal,
        fontSizePt: 13,
        bold: true,
        alignment: 'left',
        firstLineIndentPt: 0,
      },
      evidence: { elementIds: ['h2'], occurrences: 1 },
    },
  ],
  paragraphStyles: [
    {
      sectionName: 'Descrição',
      sourceStyleId: 'Normal',
      formatting: normal,
      evidence: { elementIds: ['p1'], occurrences: 1 },
    },
    {
      sectionName: 'Resultado',
      sourceStyleId: 'Normal',
      formatting: { ...normal, italic: true },
      evidence: { elementIds: ['p2'], occurrences: 1 },
    },
  ],
  listStyles: [
    {
      sourceStyleId: 'ListParagraph',
      ordered: false,
      format: 'bullet',
      start: 1,
      levels: [0],
      itemFormatting: { ...normal, indentLeftPt: 36, firstLineIndentPt: 0 },
      evidence: { elementIds: ['list1'], occurrences: 2 },
    },
  ],
  tableStyles: [
    {
      sourceStyleId: 'TableGrid',
      alignment: 'center',
      headerRows: 1,
      rowCount: 2,
      columnCount: 2,
      evidence: { elementIds: ['table1'], occurrences: 1 },
    },
  ],
  figureStyles: [
    {
      contentType: 'image/png',
      hasCaption: true,
      sectionName: 'Descrição',
      evidence: { elementIds: ['figure1'], occurrences: 1 },
    },
  ],
  captionStyles: [
    {
      sourceStyleId: 'Caption',
      formatting: {
        ...normal,
        fontSizePt: 9,
        italic: true,
        alignment: 'center',
        firstLineIndentPt: 0,
      },
      evidence: { elementIds: ['caption1'], occurrences: 1 },
    },
  ],
  headerStyles: [
    {
      variant: 'default',
      paragraphCount: 1,
      text: 'SIEAR',
      formatting: { ...normal, fontSizePt: 9, alignment: 'center' },
      evidence: { elementIds: ['header1'], occurrences: 1 },
    },
  ],
  footerStyles: [
    {
      variant: 'default',
      paragraphCount: 1,
      text: 'Página PAGE',
      containsPageNumber: true,
      formatting: { ...normal, fontSizePt: 9, alignment: 'center' },
      evidence: { elementIds: ['footer1'], occurrences: 1 },
    },
  ],
  sourceStyleIds: ['Normal', 'Heading1', 'Heading2', 'Caption'],
}

const transparentPng =
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M/wHwAEAQH/69E1WQAAAABJRU5ErkJggg=='
const report: GeneratedReport = {
  id: 'report',
  templateId: 'template',
  templateName: 'Relatório técnico',
  createdAt: '2026-08-21T00:00:00.000Z',
  sections: [
    {
      id: 'description',
      name: 'Descrição',
      order: 1,
      content: 'Procedimento executado.',
      elements: [
        { type: 'paragraph', content: 'Procedimento executado.' },
        {
          type: 'list',
          ordered: false,
          items: ['Substituição do HD', 'Instalação do sistema'],
        },
        {
          type: 'table',
          headerRows: 1,
          rows: [
            ['Campo', 'Valor'],
            ['Equipamento', 'Notebook'],
          ],
        },
        {
          type: 'figure',
          dataBase64: transparentPng,
          contentType: 'image/png',
          fileName: 'equipamento.png',
          caption: 'Figura 1 — Equipamento',
        },
      ],
    },
    {
      id: 'result',
      name: 'Resultado',
      order: 2,
      content: 'Funcionamento normal.',
      elements: [{ type: 'paragraph', content: 'Funcionamento normal.' }],
    },
  ],
}
const template = createRichReportTemplate('template')
template.formattingPattern = pattern

describe('DocumentRenderer', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'siear-renderer-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('gera um pacote DOCX válido sem alterar o conteúdo do relatório', async () => {
    const buffer = await new DocumentRenderer().render(report, template)
    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('word/document.xml')).not.toBeNull()
    expect(zip.file('word/styles.xml')).not.toBeNull()
    expect(zip.file('word/numbering.xml')).not.toBeNull()
    expect(zip.file('word/media/image1.png')).not.toBeNull()
    const documentXml = await zip.file('word/document.xml')!.async('text')
    expect(documentXml).toContain('Procedimento executado.')
    expect(documentXml).toContain('Funcionamento normal.')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).toContain('rIdImage1')
  })

  it('reproduz seções, hierarquia, estilos e elementos do padrão original', async () => {
    const file = path.join(directory, 'gerado.docx')
    await writeFile(file, await new DocumentRenderer().render(report, template))
    const extracted = await new DocxExtractor().extract(file)
    expect(
      extracted.sections.map((section) => ({
        title: section.title,
        level: section.level,
      })),
    ).toEqual([
      { title: 'Descrição', level: 1 },
      { title: 'Resultado', level: 2 },
    ])
    expect(
      extracted.paragraphs.find(
        (paragraph) => paragraph.text === 'Procedimento executado.',
      )?.formatting,
    ).toMatchObject({
      fontFamily: 'Arial',
      fontSizePt: 11,
      alignment: 'justify',
      firstLineIndentPt: 18,
    })
    expect(extracted.lists[0]).toMatchObject({
      ordered: false,
      format: 'bullet',
    })
    expect(extracted.lists[0]?.items).toHaveLength(2)
    expect(extracted.tables[0]).toMatchObject({
      rowCount: 2,
      columnCount: 2,
      headerRows: 1,
    })
    expect(extracted.figures[0]).toMatchObject({
      contentType: 'image/png',
      fileName: 'image1.png',
    })
    expect(extracted.figures[0]?.caption).toBe('Figura 1 — Equipamento')
    expect(extracted.headers[0]?.text).toBe('SIEAR')
    expect(extracted.footers[0]?.text).toContain('Página')
    expect(extracted.pageInformation).toMatchObject({
      widthPt: 612,
      heightPt: 792,
      orientation: 'portrait',
      margins: { topPt: 72, rightPt: 54, bottomPt: 72, leftPt: 54 },
      hasPageNumbering: true,
      pageBreakCount: 1,
    })
  })

  it('renderiza listas e tabelas reconhecidas no conteúdo textual sem gerar fatos', async () => {
    const textual: GeneratedReport = {
      ...report,
      sections: [
        {
          id: 'description',
          name: 'Descrição',
          order: 1,
          content:
            '- Item A\n- Item B\n\n| Campo | Valor |\n| --- | --- |\n| A | B |',
        },
      ],
    }
    const file = path.join(directory, 'texto-estruturado.docx')
    await writeFile(
      file,
      await new DocumentRenderer().render(textual, template),
    )
    const extracted = await new DocxExtractor().extract(file)
    expect(extracted.lists[0]?.items.map((item) => item.text)).toEqual([
      'Item A',
      'Item B',
    ])
    expect(extracted.tables[0]?.rows).toEqual([
      ['Campo', 'Valor'],
      ['A', 'B'],
    ])
  })
})
