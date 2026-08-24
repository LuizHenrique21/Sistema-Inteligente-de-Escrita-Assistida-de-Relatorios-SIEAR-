import JSZip from 'jszip'
import type {
  GeneratedReport,
  GeneratedReportElement,
} from '../../../src/types/generated-report'
import type {
  FooterStyle,
  FormattingPattern,
  HeaderStyle,
  ParagraphFormatting,
} from '../../../src/domain/templates/formatting-pattern'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('DocumentRenderer')

/** Limitações decorrentes de dados que o contrato aprendido ainda não fornece. */
export const DOCUMENT_RENDERER_LIMITATIONS = [
  'Figuras usam dimensões padrão porque FigureStyle não armazena largura e altura.',
  'Elementos gerados não informam nível de lista; listas são renderizadas no nível zero.',
  'HeaderStyle e FooterStyle armazenam texto agregado; múltiplos parágrafos internos não podem ser reconstruídos.',
  'PageBreakCount isolado não informa posições; somente quebras associadas a seções ou elementos são reproduzidas.',
  'SourceStyleId preserva o identificador, mas o contrato não contém a definição OOXML completa do estilo original.',
] as const

function xml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function twips(value: number | null | undefined): string | null {
  return value === null || value === undefined
    ? null
    : String(Math.round(value * 20))
}

function runProperties(format: Partial<ParagraphFormatting>): string {
  const values = [
    format.fontFamily
      ? `<w:rFonts w:ascii="${xml(format.fontFamily)}" w:hAnsi="${xml(format.fontFamily)}"/>`
      : '',
    format.fontSizePt !== null && format.fontSizePt !== undefined
      ? `<w:sz w:val="${Math.round(format.fontSizePt * 2)}"/><w:szCs w:val="${Math.round(format.fontSizePt * 2)}"/>`
      : '',
    format.bold ? '<w:b/>' : '',
    format.italic ? '<w:i/>' : '',
    format.underline ? '<w:u w:val="single"/>' : '',
  ]
  return values.some(Boolean) ? `<w:rPr>${values.join('')}</w:rPr>` : ''
}

function paragraphProperties(
  format: Partial<ParagraphFormatting>,
  styleId?: string,
  options: {
    numbering?: { id: number; level: number }
    pageBreak?: boolean
  } = {},
): string {
  const spacing = [
    format.spaceBeforePt !== null && format.spaceBeforePt !== undefined
      ? `w:before="${twips(format.spaceBeforePt)}"`
      : '',
    format.spaceAfterPt !== null && format.spaceAfterPt !== undefined
      ? `w:after="${twips(format.spaceAfterPt)}"`
      : '',
    format.lineSpacing !== null && format.lineSpacing !== undefined
      ? `w:line="${Math.round(format.lineSpacing * 240)}" w:lineRule="auto"`
      : '',
  ].filter(Boolean)
  const indent = [
    format.indentLeftPt !== null && format.indentLeftPt !== undefined
      ? `w:left="${twips(format.indentLeftPt)}"`
      : '',
    format.indentRightPt !== null && format.indentRightPt !== undefined
      ? `w:right="${twips(format.indentRightPt)}"`
      : '',
    format.firstLineIndentPt !== null && format.firstLineIndentPt !== undefined
      ? `w:firstLine="${twips(format.firstLineIndentPt)}"`
      : '',
  ].filter(Boolean)
  return `<w:pPr>${styleId ? `<w:pStyle w:val="${xml(styleId)}"/>` : ''}${format.alignment ? `<w:jc w:val="${xml(format.alignment)}"/>` : ''}${spacing.length ? `<w:spacing ${spacing.join(' ')}/>` : ''}${indent.length ? `<w:ind ${indent.join(' ')}/>` : ''}${options.numbering ? `<w:numPr><w:ilvl w:val="${options.numbering.level}"/><w:numId w:val="${options.numbering.id}"/></w:numPr>` : ''}${options.pageBreak ? '<w:pageBreakBefore/>' : ''}</w:pPr>`
}

function paragraph(
  content: string,
  format: Partial<ParagraphFormatting>,
  styleId?: string,
  options?: { numbering?: { id: number; level: number }; pageBreak?: boolean },
): string {
  return `<w:p>${paragraphProperties(format, styleId, options)}<w:r>${runProperties(format)}<w:t xml:space="preserve">${xml(content)}</w:t></w:r></w:p>`
}

function derivedElements(content: string): GeneratedReportElement[] {
  const lines = content.split(/\r?\n/).map((line) => line.trim())
  const elements: GeneratedReportElement[] = []
  for (let index = 0; index < lines.length;) {
    const line = lines[index] ?? ''
    if (!line) {
      index += 1
      continue
    }
    if (/^(?:[-*•])\s+/.test(line) || /^\d+[.)]\s+/.test(line)) {
      const ordered = /^\d+[.)]\s+/.test(line)
      const items: string[] = []
      while (index < lines.length) {
        const candidate = lines[index] ?? ''
        const matches = ordered
          ? /^\d+[.)]\s+/.test(candidate)
          : /^(?:[-*•])\s+/.test(candidate)
        if (!matches) break
        items.push(
          candidate.replace(ordered ? /^\d+[.)]\s+/ : /^(?:[-*•])\s+/, ''),
        )
        index += 1
      }
      elements.push({ type: 'list', ordered, items })
      continue
    }
    if (line.startsWith('|') && line.endsWith('|')) {
      const rows: string[][] = []
      while (
        index < lines.length &&
        (lines[index] ?? '').startsWith('|') &&
        (lines[index] ?? '').endsWith('|')
      ) {
        const cells = (lines[index] ?? '')
          .slice(1, -1)
          .split('|')
          .map((cell) => cell.trim())
        if (!cells.every((cell) => /^:?-{3,}:?$/.test(cell))) rows.push(cells)
        index += 1
      }
      elements.push({
        type: 'table',
        rows,
        headerRows: rows.length > 1 ? 1 : 0,
      })
      continue
    }
    elements.push({ type: 'paragraph', content: line })
    index += 1
  }
  return elements
}

function tableXml(
  rows: string[][],
  headerRows: number,
  styleId: string | null,
  alignment: string | null,
): string {
  const body = rows
    .map(
      (row, rowIndex) =>
        `<w:tr>${rowIndex < headerRows ? '<w:trPr><w:tblHeader/></w:trPr>' : ''}${row
          .map(
            (cell) =>
              `<w:tc><w:tcPr/><w:p><w:r>${rowIndex < headerRows ? '<w:rPr><w:b/></w:rPr>' : ''}<w:t xml:space="preserve">${xml(cell)}</w:t></w:r></w:p></w:tc>`,
          )
          .join('')}</w:tr>`,
    )
    .join('')
  return `<w:tbl><w:tblPr>${styleId ? `<w:tblStyle w:val="${xml(styleId)}"/>` : ''}${alignment ? `<w:jc w:val="${xml(alignment)}"/>` : ''}<w:tblW w:w="0" w:type="auto"/></w:tblPr>${body}</w:tbl>`
}

function drawingXml(
  relationshipId: string,
  name: string,
  index: number,
): string {
  return `<w:p><w:r><w:drawing><wp:inline distT="0" distB="0" distL="0" distR="0"><wp:extent cx="4572000" cy="2743200"/><wp:docPr id="${index}" name="${xml(name)}"/><a:graphic><a:graphicData uri="http://schemas.openxmlformats.org/drawingml/2006/picture"><pic:pic><pic:nvPicPr><pic:cNvPr id="${index}" name="${xml(name)}"/><pic:cNvPicPr/></pic:nvPicPr><pic:blipFill><a:blip r:embed="${relationshipId}"/><a:stretch><a:fillRect/></a:stretch></pic:blipFill><pic:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="4572000" cy="2743200"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom></pic:spPr></pic:pic></a:graphicData></a:graphic></wp:inline></w:drawing></w:r></w:p>`
}

function headerFooterXml(
  style: HeaderStyle | FooterStyle,
  type: 'hdr' | 'ftr',
): string {
  const format = style.formatting ?? {}
  const text =
    'containsPageNumber' in style &&
    style.containsPageNumber &&
    !/\bPAGE\b/i.test(style.text)
      ? `${style.text} PAGE`
      : style.text
  const parts = text.split(/\bPAGE\b/i)
  const runs = parts
    .map(
      (part, index) =>
        `${part ? `<w:r>${runProperties(format)}<w:t xml:space="preserve">${xml(part)}</w:t></w:r>` : ''}${index < parts.length - 1 ? '<w:fldSimple w:instr="PAGE"><w:r><w:t>1</w:t></w:r></w:fldSimple>' : ''}`,
    )
    .join('')
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:${type} xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p>${paragraphProperties(format)}${runs}</w:p></w:${type}>`
}

export class DocumentRenderer {
  async render(
    report: GeneratedReport,
    template: ReportTemplate,
  ): Promise<Buffer> {
    const timer = logger.startTimer('Document render', {
      templateId: template.metadata.id,
      sections: report.sections.length,
    })
    const pattern = template.formattingPattern
    const zip = new JSZip()
    const imageFiles: Array<{
      path: string
      data: Buffer
      contentType: string
    }> = []
    const imageRelationships: Array<{ id: string; target: string }> = []
    const headingStyleBySection = new Map<
      string,
      { id: string; level: number; format: ParagraphFormatting }
    >()
    const sectionLevelByName = new Map<string, number>()
    const visitStructure = (
      sections: ReportTemplate['structurePattern']['hierarchy'],
    ): void => {
      for (const section of sections) {
        sectionLevelByName.set(section.name, section.level)
        visitStructure(section.children)
      }
    }
    visitStructure(
      template.structurePattern.hierarchy.length
        ? template.structurePattern.hierarchy
        : template.structurePattern.sections,
    )
    pattern.headingStyles.forEach((style, index) => {
      for (const name of style.sectionNames)
        headingStyleBySection.set(name, {
          id: `SIEARHeading${index + 1}`,
          level: style.level,
          format: style.formatting,
        })
    })

    const body: string[] = []
    const orderedSections = report.sections
    for (const section of orderedSections) {
      const structuralLevel = sectionLevelByName.get(section.name) ?? 1
      const fallbackHeadingIndex = pattern.headingStyles.findIndex(
        (style) => style.level === structuralLevel,
      )
      const fallbackHeading =
        pattern.headingStyles[fallbackHeadingIndex] ?? pattern.headingStyles[0]
      const learnedHeading = headingStyleBySection.get(section.name) ?? {
        id: fallbackHeading
          ? `SIEARHeading${Math.max(0, fallbackHeadingIndex) + 1}`
          : 'Normal',
        level: fallbackHeading?.level ?? structuralLevel,
        format: fallbackHeading?.formatting ?? {},
      }
      const pageBreak = pattern.documentStyle.pageBreakBeforeSections.includes(
        section.name,
      )
      body.push(
        paragraph(section.name, learnedHeading.format, learnedHeading.id, {
          pageBreak,
        }),
      )
      const paragraphStyle =
        pattern.paragraphStyles.find(
          (style) => style.sectionName === section.name,
        ) ?? pattern.paragraphStyles[0]
      const sectionFont = pattern.documentStyle.sectionFonts.find(
        (font) => font.sectionName === section.name,
      )
      const paragraphFormat = paragraphStyle?.formatting ?? {
        fontFamily:
          sectionFont?.fontFamily ?? pattern.documentStyle.predominantFont,
        fontSizePt:
          sectionFont?.fontSizePt ??
          pattern.documentStyle.predominantFontSizePt,
      }
      const elements = section.elements ?? derivedElements(section.content)
      for (const element of elements) {
        if (element.type === 'paragraph')
          body.push(
            paragraph(
              element.content,
              paragraphFormat,
              paragraphStyle
                ? `SIEARParagraph${pattern.paragraphStyles.indexOf(paragraphStyle) + 1}`
                : undefined,
            ),
          )
        if (element.type === 'list') {
          const listStyle =
            pattern.listStyles.find(
              (style) => style.ordered === element.ordered,
            ) ?? pattern.listStyles[0]
          element.items.forEach((item) =>
            body.push(
              paragraph(
                item,
                listStyle?.itemFormatting ?? paragraphFormat,
                undefined,
                { numbering: { id: element.ordered ? 2 : 1, level: 0 } },
              ),
            ),
          )
        }
        if (element.type === 'table')
          body.push(
            tableXml(
              element.rows,
              element.headerRows,
              pattern.tableStyles[0]?.sourceStyleId ?? 'TableGrid',
              pattern.tableStyles[0]?.alignment ?? null,
            ),
          )
        if (element.type === 'page-break')
          body.push('<w:p><w:r><w:br w:type="page"/></w:r></w:p>')
        if (element.type === 'figure') {
          const imageIndex = imageFiles.length + 1
          const extension = element.contentType === 'image/png' ? 'png' : 'jpeg'
          const target = `media/image${imageIndex}.${extension}`
          const relationshipId = `rIdImage${imageIndex}`
          imageFiles.push({
            path: `word/${target}`,
            data: Buffer.from(element.dataBase64, 'base64'),
            contentType: element.contentType,
          })
          imageRelationships.push({ id: relationshipId, target })
          body.push(drawingXml(relationshipId, element.fileName, imageIndex))
          if (element.caption) {
            const caption = pattern.captionStyles[0]
            body.push(
              paragraph(
                element.caption,
                caption?.formatting ?? paragraphFormat,
                caption ? 'SIEARCaption1' : undefined,
              ),
            )
          }
        }
      }
    }

    const headerReferences: string[] = [],
      footerReferences: string[] = []
    const relationshipEntries: string[] = [
      '<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>',
      '<Relationship Id="rIdNumbering" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>',
      '<Relationship Id="rIdSettings" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/settings" Target="settings.xml"/>',
    ]
    pattern.headerStyles.forEach((style, index) => {
      const id = `rIdHeader${index + 1}`,
        file = `header${index + 1}.xml`
      zip.file(`word/${file}`, headerFooterXml(style, 'hdr'))
      relationshipEntries.push(
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="${file}"/>`,
      )
      headerReferences.push(
        `<w:headerReference w:type="${style.variant === 'unknown' ? 'default' : style.variant}" r:id="${id}"/>`,
      )
    })
    pattern.footerStyles.forEach((style, index) => {
      const id = `rIdFooter${index + 1}`,
        file = `footer${index + 1}.xml`
      zip.file(`word/${file}`, headerFooterXml(style, 'ftr'))
      relationshipEntries.push(
        `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="${file}"/>`,
      )
      footerReferences.push(
        `<w:footerReference w:type="${style.variant === 'unknown' ? 'default' : style.variant}" r:id="${id}"/>`,
      )
    })
    imageRelationships.forEach((relationship) =>
      relationshipEntries.push(
        `<Relationship Id="${relationship.id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" Target="${relationship.target}"/>`,
      ),
    )
    imageFiles.forEach((image) => zip.file(image.path, image.data))

    const page = pattern.documentStyle
    const pageWidth = twips(page.pageWidthPt) ?? '12240',
      pageHeight = twips(page.pageHeightPt) ?? '15840'
    const margins = page.margins
    const hasFirstPageVariant = [
      ...pattern.headerStyles,
      ...pattern.footerStyles,
    ].some((style) => style.variant === 'first')
    const sectPr = `<w:sectPr>${headerReferences.join('')}${footerReferences.join('')}${hasFirstPageVariant ? '<w:titlePg/>' : ''}<w:pgSz w:w="${pageWidth}" w:h="${pageHeight}"${page.orientation ? ` w:orient="${page.orientation}"` : ''}/><w:pgMar w:top="${twips(margins.topPt) ?? '1440'}" w:right="${twips(margins.rightPt) ?? '1440'}" w:bottom="${twips(margins.bottomPt) ?? '1440'}" w:left="${twips(margins.leftPt) ?? '1440'}" w:header="720" w:footer="720" w:gutter="0"/>${page.hasPageNumbering ? '<w:pgNumType w:start="1"/>' : ''}</w:sectPr>`
    zip.file(
      'word/document.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"><w:body>${body.join('')}${sectPr}</w:body></w:document>`,
    )
    zip.file('word/styles.xml', this.stylesXml(pattern))
    zip.file('word/numbering.xml', this.numberingXml(pattern))
    const hasEvenPageVariant = [
      ...pattern.headerStyles,
      ...pattern.footerStyles,
    ].some((style) => style.variant === 'even')
    zip.file(
      'word/settings.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:settings xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">${hasEvenPageVariant ? '<w:evenAndOddHeaders/>' : ''}</w:settings>`,
    )
    zip.file(
      'word/_rels/document.xml.rels',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${relationshipEntries.join('')}</Relationships>`,
    )
    zip.file(
      '_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/></Relationships>',
    )
    zip.file(
      'docProps/core.xml',
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>${xml(report.templateName)}</dc:title><dc:creator>SIEAR</dc:creator></cp:coreProperties>`,
    )
    zip.file('[Content_Types].xml', this.contentTypes(pattern, imageFiles))
    const output = await zip.generateAsync({
      type: 'nodebuffer',
      compression: 'DEFLATE',
    })
    const elements = report.sections.flatMap(
      (section) => section.elements ?? [],
    )
    timer.end('Document render completed', {
      outputBytes: output.byteLength,
      paragraphs: elements.filter((element) => element.type === 'paragraph')
        .length,
      tables: elements.filter((element) => element.type === 'table').length,
      figures: imageFiles.length,
    })
    return output
  }

  private stylesXml(pattern: FormattingPattern): string {
    const defaultFormat = {
      fontFamily: pattern.documentStyle.predominantFont,
      fontSizePt: pattern.documentStyle.predominantFontSizePt,
    }
    const headings = pattern.headingStyles
      .map(
        (style, index) =>
          `<w:style w:type="paragraph" w:styleId="SIEARHeading${index + 1}"><w:name w:val="SIEAR Heading ${index + 1}"/><w:basedOn w:val="Normal"/><w:outlineLvl w:val="${Math.max(0, style.level - 1)}"/>${paragraphProperties(style.formatting)}${runProperties(style.formatting)}</w:style>`,
      )
      .join('')
    const paragraphs = pattern.paragraphStyles
      .map(
        (style, index) =>
          `<w:style w:type="paragraph" w:styleId="SIEARParagraph${index + 1}"><w:name w:val="SIEAR Paragraph ${index + 1}"/><w:basedOn w:val="Normal"/>${paragraphProperties(style.formatting)}${runProperties(style.formatting)}</w:style>`,
      )
      .join('')
    const captions = pattern.captionStyles
      .map(
        (style, index) =>
          `<w:style w:type="paragraph" w:styleId="SIEARCaption${index + 1}"><w:name w:val="Caption"/><w:basedOn w:val="Normal"/>${paragraphProperties(style.formatting)}${runProperties(style.formatting)}</w:style>`,
      )
      .join('')
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:default="1" w:styleId="Normal"><w:name w:val="Normal"/>${paragraphProperties(defaultFormat)}${runProperties(defaultFormat)}</w:style><w:style w:type="table" w:styleId="TableGrid"><w:name w:val="Table Grid"/><w:tblPr><w:tblBorders><w:top w:val="single" w:sz="4" w:color="auto"/><w:left w:val="single" w:sz="4" w:color="auto"/><w:bottom w:val="single" w:sz="4" w:color="auto"/><w:right w:val="single" w:sz="4" w:color="auto"/><w:insideH w:val="single" w:sz="4" w:color="auto"/><w:insideV w:val="single" w:sz="4" w:color="auto"/></w:tblBorders></w:tblPr></w:style>${headings}${paragraphs}${captions}</w:styles>`
  }

  private numberingXml(pattern: FormattingPattern): string {
    const bullet =
      pattern.listStyles.find((style) => style.ordered === false)?.format ??
      'bullet'
    const decimal =
      pattern.listStyles.find((style) => style.ordered === true)?.format ??
      'decimal'
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:abstractNum w:abstractNumId="0"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${xml(bullet)}"/><w:lvlText w:val="•"/></w:lvl></w:abstractNum><w:abstractNum w:abstractNumId="1"><w:lvl w:ilvl="0"><w:start w:val="1"/><w:numFmt w:val="${xml(decimal)}"/><w:lvlText w:val="%1."/></w:lvl></w:abstractNum><w:num w:numId="1"><w:abstractNumId w:val="0"/></w:num><w:num w:numId="2"><w:abstractNumId w:val="1"/></w:num></w:numbering>`
  }

  private contentTypes(
    pattern: FormattingPattern,
    images: Array<{ contentType: string }>,
  ): string {
    const defaults = new Map([
      ['rels', 'application/vnd.openxmlformats-package.relationships+xml'],
      ['xml', 'application/xml'],
    ])
    images.forEach((image) =>
      defaults.set(
        image.contentType === 'image/png' ? 'png' : 'jpeg',
        image.contentType,
      ),
    )
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">${[...defaults].map(([extension, type]) => `<Default Extension="${extension}" ContentType="${type}"/>`).join('')}<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/><Override PartName="/word/settings.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.settings+xml"/>${pattern.headerStyles.map((_, index) => `<Override PartName="/word/header${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>`).join('')}${pattern.footerStyles.map((_, index) => `<Override PartName="/word/footer${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>`).join('')}<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/></Types>`
  }
}
