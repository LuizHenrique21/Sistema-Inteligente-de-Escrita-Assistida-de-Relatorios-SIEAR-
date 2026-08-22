import { randomUUID } from 'node:crypto'
import { readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import JSZip from 'jszip'
import mammoth from 'mammoth'
import { DocumentExtractionError } from './document-errors'
import type {
  DocumentExtractor,
  DocumentHeaderFooter,
  DocumentRepresentation,
  DocumentStyle,
  ExtractedList,
  ExtractedSection,
  ParagraphFormatting,
} from './types'

const EMPTY: ParagraphFormatting = {
  fontFamily: null,
  fontSizePt: null,
  bold: false,
  italic: false,
  underline: false,
  alignment: null,
  lineSpacing: null,
  spaceBeforePt: null,
  spaceAfterPt: null,
  indentLeftPt: null,
  indentRightPt: null,
  firstLineIndentPt: null,
  styleId: null,
}

function decode(value: string): string {
  return value
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code: string) =>
      String.fromCodePoint(Number(code)),
    )
}

function attr(xml: string, element: string, name = 'w:val'): string | null {
  const match = xml.match(
    new RegExp(`<${element}\\b[^>]*\\b${name}="([^"]*)"`, 'i'),
  )
  return match ? decode(match[1] ?? '') : null
}

function xmlText(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/gi)]
    .map((match) => decode(match[1] ?? ''))
    .join('')
    .trim()
}

function numeric(value: string | null, divisor = 1): number | null {
  return value !== null && Number.isFinite(Number(value))
    ? Number(value) / divisor
    : null
}

function formatting(xml: string, styleId: string | null): ParagraphFormatting {
  const run = xml.match(/<w:rPr\b[\s\S]*?<\/w:rPr>/i)?.[0] ?? ''
  const paragraph = xml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/i)?.[0] ?? ''
  return {
    ...EMPTY,
    fontFamily:
      run.match(/<w:rFonts\b[^>]*(?:w:ascii|w:hAnsi)="([^"]+)"/i)?.[1] ?? null,
    fontSizePt: numeric(attr(run, 'w:sz'), 2),
    bold: /<w:b(?:\s|\/|>)/i.test(run) && attr(run, 'w:b') !== '0',
    italic: /<w:i(?:\s|\/|>)/i.test(run) && attr(run, 'w:i') !== '0',
    underline: /<w:u(?:\s|\/|>)/i.test(run) && attr(run, 'w:u') !== 'none',
    alignment: attr(paragraph, 'w:jc'),
    lineSpacing: numeric(attr(paragraph, 'w:spacing', 'w:line'), 240),
    spaceBeforePt: numeric(attr(paragraph, 'w:spacing', 'w:before'), 20),
    spaceAfterPt: numeric(attr(paragraph, 'w:spacing', 'w:after'), 20),
    indentLeftPt: numeric(attr(paragraph, 'w:ind', 'w:left'), 20),
    indentRightPt: numeric(attr(paragraph, 'w:ind', 'w:right'), 20),
    firstLineIndentPt: numeric(attr(paragraph, 'w:ind', 'w:firstLine'), 20),
    styleId,
  }
}

function parseStyles(xml: string): DocumentStyle[] {
  return [...xml.matchAll(/<w:style\b[\s\S]*?<\/w:style>/gi)].map((match) => {
    const value = match[0]
    const id =
      value.match(/<w:style\b[^>]*w:styleId="([^"]+)"/i)?.[1] ?? randomUUID()
    return {
      id,
      name: attr(value, 'w:name') ?? id,
      type: value.match(/<w:style\b[^>]*w:type="([^"]+)"/i)?.[1] ?? 'unknown',
      basedOn: attr(value, 'w:basedOn'),
      isDefault: /<w:style\b[^>]*w:default="(?:1|true)"/i.test(value),
      formatting: formatting(value, id),
    }
  })
}

function headingLevel(
  styleId: string | null,
  styles: DocumentStyle[],
): number | null {
  const style = styles.find((item) => item.id === styleId)
  const match = `${styleId ?? ''} ${style?.name ?? ''}`.match(
    /(?:heading|t[íi]tulo)\s*([1-9])/i,
  )
  return match ? Number(match[1]) : null
}

function relationships(xml: string): Map<string, string> {
  return new Map(
    [
      ...xml.matchAll(
        /<Relationship\b[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"/gi,
      ),
    ].map((match) => [match[1] ?? '', match[2] ?? '']),
  )
}

function numberingProperties(
  xml: string,
): Map<string, Omit<ExtractedList, 'id' | 'order' | 'numberId' | 'items'>> {
  const abstracts = new Map<
    string,
    {
      ordered: boolean | null
      format: string | null
      start: number | null
      styleId: string | null
    }
  >()
  for (const match of xml.matchAll(
    /<w:abstractNum\b[\s\S]*?<\/w:abstractNum>/gi,
  )) {
    const id = match[0].match(
      /<w:abstractNum\b[^>]*w:abstractNumId="([^"]+)"/i,
    )?.[1]
    if (!id) continue
    const format = attr(match[0], 'w:numFmt')
    abstracts.set(id, {
      ordered: format ? format !== 'bullet' : null,
      format,
      start: numeric(attr(match[0], 'w:start')),
      styleId: attr(match[0], 'w:pStyle'),
    })
  }
  const result = new Map<
    string,
    {
      ordered: boolean | null
      format: string | null
      start: number | null
      styleId: string | null
    }
  >()
  for (const match of xml.matchAll(/<w:num\b[\s\S]*?<\/w:num>/gi)) {
    const id = match[0].match(/<w:num\b[^>]*w:numId="([^"]+)"/i)?.[1]
    const abstractId = attr(match[0], 'w:abstractNumId')
    if (id)
      result.set(
        id,
        abstracts.get(abstractId ?? '') ?? {
          ordered: null,
          format: null,
          start: null,
          styleId: null,
        },
      )
  }
  return result
}

function headerFooter(
  xml: string,
  type: 'header' | 'footer',
  variant: DocumentHeaderFooter['variant'],
): DocumentHeaderFooter {
  const paragraphs = [...xml.matchAll(/<w:p\b[\s\S]*?<\/w:p>/gi)]
    .map((match) => xmlText(match[0]))
    .filter(Boolean)
  return {
    id: randomUUID(),
    type,
    variant,
    text: paragraphs.join('\n'),
    paragraphs,
  }
}

export class DocxExtractor implements DocumentExtractor {
  async extract(filePath: string): Promise<DocumentRepresentation> {
    try {
      const [buffer, file] = await Promise.all([
        readFile(filePath),
        stat(filePath),
      ])
      const zip = await JSZip.loadAsync(buffer)
      const readXml = async (name: string): Promise<string> =>
        zip.file(name)?.async('text') ?? ''
      const [documentXml, stylesXml, relsXml, coreXml, numberingXml] =
        await Promise.all([
          readXml('word/document.xml'),
          readXml('word/styles.xml'),
          readXml('word/_rels/document.xml.rels'),
          readXml('docProps/core.xml'),
          readXml('word/numbering.xml'),
        ])
      if (!documentXml) throw new Error('word/document.xml ausente')
      const styles = parseStyles(stylesXml)
      const rels = relationships(relsXml)
      const numbering = numberingProperties(numberingXml)
      const sections: DocumentRepresentation['sections'] = [],
        paragraphs: DocumentRepresentation['paragraphs'] = [],
        headings: DocumentRepresentation['headings'] = [],
        lists: ExtractedList[] = [],
        tables: DocumentRepresentation['tables'] = [],
        figures: DocumentRepresentation['figures'] = [],
        elements: DocumentRepresentation['elements'] = []
      const sectionStack: ExtractedSection[] = []
      let currentList: ExtractedList | null = null
      let order = 0
      const body =
        documentXml.match(/<w:body\b[\s\S]*?<\/w:body>/i)?.[0] ?? documentXml

      for (const block of body.matchAll(
        /<w:p\b[\s\S]*?<\/w:p>|<w:tbl\b[\s\S]*?<\/w:tbl>/gi,
      )) {
        const xml = block[0]
        if (/^<w:tbl\b/i.test(xml)) {
          currentList = null
          const rowXml = [...xml.matchAll(/<w:tr\b[\s\S]*?<\/w:tr>/gi)]
          const rows = rowXml.map((row) =>
            [...row[0].matchAll(/<w:tc\b[\s\S]*?<\/w:tc>/gi)].map((cell) =>
              xmlText(cell[0]),
            ),
          )
          const table = {
            id: randomUUID(),
            order: ++order,
            rowCount: rows.length,
            columnCount: Math.max(0, ...rows.map((row) => row.length)),
            rows,
            headerRows: rowXml.filter((row) =>
              /<w:tblHeader(?:\s|\/|>)/i.test(row[0]),
            ).length,
            styleId: attr(xml, 'w:tblStyle'),
            alignment: attr(xml, 'w:jc'),
            sectionId: sectionStack.at(-1)?.id ?? null,
          }
          tables.push(table)
          elements.push({ id: table.id, type: 'table', order: table.order })
          continue
        }
        const text = xmlText(xml),
          styleId = attr(xml, 'w:pStyle'),
          level = headingLevel(styleId, styles),
          numberId = attr(xml, 'w:numId'),
          listLevel = Number(attr(xml, 'w:ilvl') ?? 0)
        const pageBreak =
          /<w:br\b[^>]*w:type="page"/i.test(xml) ||
          /<w:pageBreakBefore(?:\s|\/|>)/i.test(xml)
        if (pageBreak) {
          const id = randomUUID()
          elements.push({ id, type: 'page-break', order: ++order })
        }
        if (!text && !/<a:blip\b/i.test(xml)) continue
        const paragraphId = randomUUID(),
          paragraphOrder = ++order
        let sectionId = sectionStack.at(-1)?.id ?? null
        if (level && text) {
          while (
            sectionStack.length &&
            (sectionStack.at(-1)?.level ?? 0) >= level
          )
            sectionStack.pop()
          const section: ExtractedSection = {
            id: randomUUID(),
            title: text,
            level,
            order: sections.length + 1,
            content: '',
            parentSectionId: sectionStack.at(-1)?.id ?? null,
          }
          sections.push(section)
          sectionStack.push(section)
          sectionId = section.id
        } else if (text && sectionStack.at(-1)) {
          const current = sectionStack.at(-1)
          if (current)
            current.content = [current.content, text].filter(Boolean).join('\n')
        }
        const paragraph = {
          id: paragraphId,
          text,
          order: paragraphOrder,
          style: level
            ? ('heading' as const)
            : numberId
              ? ('list-item' as const)
              : /caption/i.test(styleId ?? '')
                ? ('caption' as const)
                : ('paragraph' as const),
          headingLevel: level,
          sectionId,
          numbering: numberId ? { numberId, level: listLevel } : null,
          formatting: formatting(xml, styleId),
          pageBreakBefore: pageBreak,
        }
        paragraphs.push(paragraph)
        elements.push({
          id: paragraphId,
          type: level ? 'heading' : numberId ? 'list-item' : 'paragraph',
          order: paragraphOrder,
        })
        if (level) {
          currentList = null
          headings.push({
            id: randomUUID(),
            paragraphId,
            title: text,
            level,
            order: headings.length + 1,
            sectionId: sectionId ?? '',
          })
        } else if (numberId) {
          if (!currentList || currentList.numberId !== numberId) {
            currentList = {
              id: randomUUID(),
              order: lists.length + 1,
              numberId,
              ...(numbering.get(numberId) ?? {
                ordered: null,
                format: null,
                start: null,
                styleId: null,
              }),
              items: [],
            }
            lists.push(currentList)
          }
          currentList.items.push({
            id: randomUUID(),
            paragraphId,
            text,
            level: listLevel,
            order: currentList.items.length + 1,
          })
        } else currentList = null
        for (const image of xml.matchAll(/<a:blip\b[^>]*r:embed="([^"]+)"/gi)) {
          const relationshipId = image[1] ?? '',
            target = rels.get(relationshipId) ?? null
          const figure = {
            id: randomUUID(),
            index: figures.length + 1,
            order: ++order,
            relationshipId,
            fileName: target ? path.basename(target) : null,
            contentType: target
              ? `image/${path.extname(target).slice(1).replace('jpg', 'jpeg')}`
              : null,
            caption: paragraph.style === 'caption' ? text : null,
            sectionId,
            previousParagraphId: paragraphId,
            nextParagraphId: null,
          }
          figures.push(figure)
          elements.push({ id: figure.id, type: 'figure', order: figure.order })
        }
      }
      for (const figure of figures) {
        const next = paragraphs.find(
          (paragraph) => paragraph.order > figure.order,
        )
        figure.nextParagraphId = next?.id ?? null
        if (!figure.caption && next?.style === 'caption')
          figure.caption = next.text
      }
      const headers: DocumentHeaderFooter[] = [],
        footers: DocumentHeaderFooter[] = []
      for (const name of Object.keys(zip.files).filter((value) =>
        /^word\/(header|footer)\d+\.xml$/i.test(value),
      )) {
        const type = name.includes('/header') ? 'header' : 'footer',
          target = name.replace('word/', '')
        const relationId = [...rels].find(
          ([, value]) => value.replace(/^\.\//, '') === target,
        )?.[0]
        const reference = relationId
          ? documentXml.match(
              new RegExp(
                `<w:${type}Reference\\b[^>]*w:type="([^"]+)"[^>]*r:id="${relationId}"`,
                'i',
              ),
            )
          : null
        const parsed = headerFooter(
          await readXml(name),
          type,
          (reference?.[1] as DocumentHeaderFooter['variant']) ?? 'unknown',
        )
        ;(type === 'header' ? headers : footers).push(parsed)
      }
      if (
        paragraphs.every((paragraph) => !paragraph.text) &&
        tables.length === 0 &&
        figures.length === 0
      )
        throw new DocumentExtractionError(
          'EMPTY_DOCUMENT',
          'O documento está vazio.',
        )
      const text = (await mammoth.extractRawText({ buffer })).value.trim()
      const sectPr =
        documentXml.match(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/gi)?.at(-1) ?? ''
      const core = (tag: string): string | null =>
        decode(
          coreXml.match(
            new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, 'i'),
          )?.[1] ?? '',
        ) || null
      return {
        fileName: path.basename(filePath),
        fileType: 'docx',
        text,
        metadata: {
          fileSize: file.size,
          extractedAt: new Date().toISOString(),
          title: core('dc:title'),
          author: core('dc:creator'),
          createdAt: core('dcterms:created'),
          modifiedAt: core('dcterms:modified'),
        },
        elements,
        paragraphs,
        sections,
        headings,
        lists,
        tables,
        figures,
        headers,
        footers,
        pageInformation: {
          widthPt: numeric(attr(sectPr, 'w:pgSz', 'w:w'), 20),
          heightPt: numeric(attr(sectPr, 'w:pgSz', 'w:h'), 20),
          orientation:
            (attr(sectPr, 'w:pgSz', 'w:orient') as
              'portrait' | 'landscape' | null) ??
            (Number(attr(sectPr, 'w:pgSz', 'w:w')) >
            Number(attr(sectPr, 'w:pgSz', 'w:h'))
              ? 'landscape'
              : 'portrait'),
          margins: {
            topPt: numeric(attr(sectPr, 'w:pgMar', 'w:top'), 20),
            rightPt: numeric(attr(sectPr, 'w:pgMar', 'w:right'), 20),
            bottomPt: numeric(attr(sectPr, 'w:pgMar', 'w:bottom'), 20),
            leftPt: numeric(attr(sectPr, 'w:pgMar', 'w:left'), 20),
          },
          pageBreakCount: elements.filter(
            (element) => element.type === 'page-break',
          ).length,
          hasPageNumbering:
            /<w:pgNumType\b/i.test(sectPr) ||
            footers.some((footer) => /\bPAGE\b/i.test(footer.text)),
        },
        formatting: {
          defaultParagraph:
            styles.find(
              (style) => style.isDefault && style.type === 'paragraph',
            )?.formatting ?? {},
        },
        styles,
      }
    } catch (error: unknown) {
      if (error instanceof DocumentExtractionError) throw error
      throw new DocumentExtractionError(
        'EXTRACTION_FAILED',
        `Não foi possível interpretar o arquivo DOCX: ${error instanceof Error ? error.message : 'arquivo inválido'}.`,
      )
    }
  }
}
