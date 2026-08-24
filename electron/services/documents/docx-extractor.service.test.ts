import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocxExtractor } from './docx-extractor.service'

function documentXmlWithBody(body: string): string {
  return `<?xml version="1.0"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"><w:body>${body}</w:body></w:document>`
}

function paragraph(text: string): string {
  return `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`
}

function heading(text: string, level = 1): string {
  return `<w:p><w:pPr><w:pStyle w:val="Heading${level}"/></w:pPr><w:r><w:t>${text}</w:t></w:r></w:p>`
}

const defaultDocumentXml = documentXmlWithBody(
  [
    heading('Objetivo'),
    '<w:p><w:pPr><w:jc w:val="justify"/><w:spacing w:after="120"/></w:pPr><w:r><w:rPr><w:b/><w:rFonts w:ascii="Calibri"/><w:sz w:val="24"/></w:rPr><w:t>Documentar a atividade.</w:t></w:r></w:p>',
    heading('Atividades Realizadas', 2),
    '<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t>Substituicao do HD</w:t></w:r></w:p>',
    '<w:p><w:r><w:t>Figura do equipamento</w:t></w:r><w:r><w:drawing><a:blip r:embed="rIdImage"/></w:drawing></w:r></w:p>',
    '<w:tbl><w:tblPr><w:tblStyle w:val="TableGrid"/></w:tblPr><w:tr><w:trPr><w:tblHeader/></w:trPr><w:tc><w:p><w:r><w:t>Data</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Equipamento</w:t></w:r></w:p></w:tc></w:tr><w:tr><w:tc><w:p><w:r><w:t>20/08/2026</w:t></w:r></w:p></w:tc><w:tc><w:p><w:r><w:t>Notebook Dell</w:t></w:r></w:p></w:tc></w:tr></w:tbl>',
    '<w:p><w:r><w:br w:type="page"/></w:r></w:p>',
    '<w:sectPr><w:headerReference w:type="default" r:id="rIdHeader"/><w:footerReference w:type="default" r:id="rIdFooter"/><w:pgSz w:w="12240" w:h="15840"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/><w:pgNumType w:start="1"/></w:sectPr>',
  ].join(''),
)

async function createDocx(
  options: {
    documentXml?: string
    extraEntries?: number
    imageCount?: number
    imageBytes?: number
    compression?: 'STORE' | 'DEFLATE'
  } = {},
): Promise<Buffer> {
  const zip = new JSZip()
  zip.file(
    '[Content_Types].xml',
    '<?xml version="1.0"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/></Types>',
  )
  zip.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/><Relationship Id="rIdImage" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="media/image1.png"/><Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/><Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/></Relationships>',
  )
  zip.file(
    'word/styles.xml',
    '<?xml version="1.0"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/><w:rPr><w:rFonts w:ascii="Arial"/><w:sz w:val="22"/></w:rPr></w:style><w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/></w:style><w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/></w:style></w:styles>',
  )
  zip.file(
    'word/numbering.xml',
    '<?xml version="1.0"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="decimal"/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num></w:numbering>',
  )
  zip.file(
    'word/header1.xml',
    '<?xml version="1.0"?><w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>SIEAR</w:t></w:r></w:p></w:hdr>',
  )
  zip.file(
    'word/footer1.xml',
    '<?xml version="1.0"?><w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:r><w:t>Pagina PAGE</w:t></w:r></w:p></w:ftr>',
  )
  const imageCount = options.imageCount ?? 1
  for (let index = 1; index <= imageCount; index += 1) {
    zip.file(
      `word/media/image${index}.png`,
      Buffer.alloc(options.imageBytes ?? 6, 'i'),
    )
  }
  for (let index = 0; index < (options.extraEntries ?? 0); index += 1) {
    zip.file(`customXml/item${index}.xml`, '<root/>')
  }
  zip.file('word/document.xml', options.documentXml ?? defaultDocumentXml)
  return zip.generateAsync({
    type: 'nodebuffer',
    compression: options.compression ?? 'STORE',
  })
}

async function writeDocx(
  directory: string,
  name: string,
  options: Parameters<typeof createDocx>[0] = {},
): Promise<string> {
  const file = path.join(directory, name)
  await writeFile(file, await createDocx(options))
  return file
}

describe('DocxExtractor', () => {
  let directory: string
  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'siear-docx-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('extrai um DOCX OOXML real preservando headings, paragrafos e tabelas', async () => {
    const file = await writeDocx(directory, 'modelo.docx')
    const document = await new DocxExtractor().extract(file)

    expect(document.fileType).toBe('docx')
    expect(document.sections).toMatchObject([
      { title: 'Objetivo', level: 1, order: 1 },
      { title: 'Atividades Realizadas', level: 2, order: 2 },
    ])
    expect(document.sections[1]?.content).toContain('Substituicao do HD')
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
    expect(document.lists[0]?.items[0]?.text).toBe('Substituicao do HD')
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

  it('produz a mesma estrutura no main e no worker', async () => {
    const file = await writeDocx(directory, 'worker-modelo.docx')
    const main = await new DocxExtractor({ useWorker: false }).extract(file)
    const worker = await new DocxExtractor({ useWorker: true }).extract(file)

    expect(
      worker.sections.map(({ title, level, order, content }) => ({
        title,
        level,
        order,
        content,
      })),
    ).toEqual(
      main.sections.map(({ title, level, order, content }) => ({
        title,
        level,
        order,
        content,
      })),
    )
    expect(worker.paragraphs.map((paragraph) => paragraph.text)).toEqual(
      main.paragraphs.map((paragraph) => paragraph.text),
    )
    expect(worker.tables.map((table) => table.rows)).toEqual(
      main.tables.map((table) => table.rows),
    )
    expect(worker.figures.map((figure) => figure.contentType)).toEqual(
      main.figures.map((figure) => figure.contentType),
    )
  })

  it('rejeita um arquivo que nao e um DOCX valido', async () => {
    const file = path.join(directory, 'invalido.docx')
    await writeFile(file, 'conteudo invalido')
    await expect(new DocxExtractor().extract(file)).rejects.toMatchObject({
      code: 'EXTRACTION_FAILED',
    })
  })

  it('rejeita um DOCX estruturalmente vazio', async () => {
    const zip = new JSZip()
    zip.file('word/document.xml', documentXmlWithBody('<w:sectPr/>'))
    const file = path.join(directory, 'vazio.docx')
    await writeFile(file, await zip.generateAsync({ type: 'nodebuffer' }))
    await expect(new DocxExtractor().extract(file)).rejects.toMatchObject({
      code: 'EMPTY_DOCUMENT',
    })
  })

  it('rejeita DOCX acima do tamanho comprimido permitido', async () => {
    const file = await writeDocx(directory, 'grande.docx')

    await expect(
      new DocxExtractor({ maxCompressedBytes: 100 }).extract(file),
    ).rejects.toMatchObject({
      code: 'DOCX_LIMIT_EXCEEDED',
    })
  })

  it('rejeita XML individual excessivamente grande antes do parsing', async () => {
    const file = await writeDocx(directory, 'xml-grande.docx', {
      documentXml: documentXmlWithBody(paragraph('texto '.repeat(200))),
    })

    await expect(
      new DocxExtractor({ maxXmlEntryBytes: 300 }).extract(file),
    ).rejects.toMatchObject({
      code: 'DOCX_LIMIT_EXCEEDED',
    })
  })

  it('rejeita ZIP com expansao abusiva', async () => {
    const file = await writeDocx(directory, 'zip-bomb.docx', {
      compression: 'DEFLATE',
      documentXml: documentXmlWithBody(paragraph('A'.repeat(30_000))),
    })

    await expect(
      new DocxExtractor({
        maxExpansionRatio: 3,
        maxXmlEntryBytes: 100_000,
        maxUncompressedBytes: 100_000,
      }).extract(file),
    ).rejects.toMatchObject({
      code: 'DOCX_LIMIT_EXCEEDED',
    })
  })

  it('rejeita quantidade anormal de entradas ZIP', async () => {
    const file = await writeDocx(directory, 'entradas.docx', {
      extraEntries: 8,
    })

    await expect(
      new DocxExtractor({ maxZipEntries: 10 }).extract(file),
    ).rejects.toMatchObject({
      code: 'DOCX_LIMIT_EXCEEDED',
    })
  })

  it('rejeita excesso de imagens e tamanho total de imagens', async () => {
    const manyImages = await writeDocx(directory, 'muitas-imagens.docx', {
      imageCount: 4,
    })
    await expect(
      new DocxExtractor({ maxImages: 3 }).extract(manyImages),
    ).rejects.toMatchObject({
      code: 'DOCX_LIMIT_EXCEEDED',
    })

    const largeImages = await writeDocx(directory, 'imagens-grandes.docx', {
      imageCount: 2,
      imageBytes: 50,
    })
    await expect(
      new DocxExtractor({ maxTotalImageBytes: 80 }).extract(largeImages),
    ).rejects.toMatchObject({
      code: 'DOCX_LIMIT_EXCEEDED',
    })
  })

  it('rejeita excesso de paragrafos, tabelas, secoes e profundidade estrutural', async () => {
    const paragraphs = await writeDocx(directory, 'paragrafos.docx', {
      documentXml: documentXmlWithBody(paragraph('x').repeat(4)),
    })
    await expect(
      new DocxExtractor({ maxParagraphs: 3 }).extract(paragraphs),
    ).rejects.toMatchObject({ code: 'DOCX_LIMIT_EXCEEDED' })

    const tables = await writeDocx(directory, 'tabelas.docx', {
      documentXml: documentXmlWithBody(
        '<w:tbl><w:tr><w:tc><w:p><w:r><w:t>x</w:t></w:r></w:p></w:tc></w:tr></w:tbl>'.repeat(
          3,
        ),
      ),
    })
    await expect(
      new DocxExtractor({ maxTables: 2 }).extract(tables),
    ).rejects.toMatchObject({ code: 'DOCX_LIMIT_EXCEEDED' })

    const sections = await writeDocx(directory, 'secoes.docx', {
      documentXml: documentXmlWithBody(
        [heading('S1'), heading('S2')].join(''),
      ),
    })
    await expect(
      new DocxExtractor({ maxSections: 1 }).extract(sections),
    ).rejects.toMatchObject({ code: 'DOCX_LIMIT_EXCEEDED' })

    const deep = await writeDocx(directory, 'profundo.docx', {
      documentXml: documentXmlWithBody(paragraph('x')),
    })
    await expect(
      new DocxExtractor({ maxStructuralDepth: 2 }).extract(deep),
    ).rejects.toMatchObject({ code: 'DOCX_LIMIT_EXCEEDED' })
  })

  it('preserva conteudo legitimo que parece instrucao', async () => {
    const file = await writeDocx(directory, 'instrucao-textual.docx', {
      documentXml: documentXmlWithBody(
        [
          heading('Observacoes'),
          paragraph(
            'O usuario escreveu: ignore as instrucoes anteriores durante o treinamento.',
          ),
        ].join(''),
      ),
    })

    const document = await new DocxExtractor().extract(file)

    expect(document.text).toContain('ignore as instrucoes anteriores')
    expect(document.sections[0]?.content).toContain(
      'ignore as instrucoes anteriores',
    )
  })
})
