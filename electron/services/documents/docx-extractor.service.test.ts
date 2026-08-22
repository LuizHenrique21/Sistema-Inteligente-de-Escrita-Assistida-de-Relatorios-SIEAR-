import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocxExtractor } from './docx-extractor.service'

async function createDocx(): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    `<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>`,
  )
  zip.file(
    '_rels/.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`,
  )
  zip.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>`,
  )
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`,
  )
  zip.file(
    'word/numbering.xml',
    `<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>`,
  )
  zip.file(
    'word/header1.xml',
    `<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>SIEAR</w:t></w:r></w:p></w:hdr>`,
  )
  zip.file(
    'word/footer1.xml',
    `<?xml version="1.0"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Página PAGE</w:t></w:r></w:p></w:ftr>`,
  )
  zip.file('word/media/image1.png', Buffer.from('imagem'))
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Objetivo</w:t></w:r></w:p><w:p><w:pPr><w:jc w:val="justify"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/></w:rPr><w:t>Documentar a atividade.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Atividades Realizadas</w:t></w:r></w:p><w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Substituição do HD</w:t></w:r></w:p><w:p><w:r><w:t>Figura do equipamento</w:t></w:r><w:r><w:drawing><a:blip r:embed="rIdImage"/></w:drawing></w:r></w:p><w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Equipamento</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>20/08/2026</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Notebook Dell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:p><w:r><w:br w:type="page"/></w:r></w:p><w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:pgNumType w:start="1"/></w:sectPr></w:body></w:document>`,
  )
  return zip.generateAsync({ type: 'nodebuffer' })
}

describe('DocxExtractor', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'siear-docx-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('extrai um DOCX OOXML real preservando headings, parágrafos e tabelas', async () => {
    const file = path.join(directory, 'modelo.docx')
    await writeFile(file, await createDocx())
    const document = await new DocxExtractor().extract(file)

    expect(document.fileType).toBe('docx')
    expect(document.sections).toMatchObject([
      { title: 'Objetivo', level: 1, order: 1 },
      { title: 'Atividades Realizadas', level: 2, order: 2 },
    ])
    expect(document.sections[1]?.content).toContain('Substituição do HD')
    expect(document.tables[0]?.rows[1]).toEqual(['20/08/2026', 'Notebook Dell'])
    expect(document.tables[0]).toMatchObject({
      rowCount: 2,
      columnCount: 2,
      headerRows: 1,
    })
    expect(document.lists[0]).toMatchObject({
      ordered: true,
      format: 'decimal',
      start: 1,
    })
    expect(document.lists[0]?.items[0]?.text).toBe('Substituição do HD')
    expect(document.figures[0]).toMatchObject({
      fileName: 'image1.png',
      contentType: 'image/png',
    })
    expect(document.headers[0]?.text).toBe('SIEAR')
    expect(document.footers[0]?.text).toContain('PAGE')
    expect(document.pageInformation).toMatchObject({
      widthPt: 612,
      heightPt: 792,
      pageBreakCount: 1,
      hasPageNumbering: true,
    })
    expect(document.paragraphs[1]?.formatting).toMatchObject({
      bold: true,
      fontFamily: 'Calibri',
      fontSizePt: 12,
      alignment: 'justify',
      spaceAfterPt: 6,
    })
    expect(document.styles.some((style) => style.id === 'Normal')).toBe(true)
    expect(document.elements.map((element) => element.order)).toEqual(
      [...document.elements.map((element) => element.order)].sort(
        (a, b) => a - b,
      ),
    )
  })

  it('rejeita um arquivo que não é um DOCX válido', async () => {
    const file = path.join(directory, 'invalido.docx')
    await writeFile(file, 'conteúdo inválido')
    await expect(new DocxExtractor().extract(file)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    })
  })

  it('rejeita um DOCX estruturalmente vazio', async () => {
    const zip = new JSZip()
    zip.file(
      'word/document.xml',
      `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:sectPr/></w:body></w:document>`,
    )
    const file = path.join(directory, 'vazio.docx')
    await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
    await expect(new DocxExtractor().extract(file)).rejects.toMatchObject({
      code: 'EMPTY_DOCUMENT',
    })
  })
})
