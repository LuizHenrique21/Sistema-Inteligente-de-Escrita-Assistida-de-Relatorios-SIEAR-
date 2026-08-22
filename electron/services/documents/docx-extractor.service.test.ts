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
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`,
  )
  zip.file(
    'word/styles.xml',
    `<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>`,
  )
  zip.file(
    'word/document.xml',
    `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:pPr><w:pStyle w:val="Heading1"/></w:pPr><w:r><w:t>Objetivo</w:t></w:r></w:p><w:p><w:r><w:t>Documentar a atividade.</w:t></w:r></w:p><w:p><w:pPr><w:pStyle w:val="Heading2"/></w:pPr><w:r><w:t>Atividades Realizadas</w:t></w:r></w:p><w:p><w:r><w:t>Substituição do HD</w:t></w:r></w:p><w:tbl><w:tr><w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Equipamento</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>20/08/2026</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Notebook Dell</w:t></w:r></w:p></w:tc></w:tr></w:tbl><w:sectPr/></w:body></w:document>`,
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
  })
})
