import type {
  CaptionStyle,
  FigureStyle,
  FormattingPattern,
  HeadingStyle,
  ListStyle,
  ParagraphStyle,
  TableStyle,
} from '../../../src/domain/templates/formatting-pattern'
import type {
  DocumentRepresentation,
  DocumentStyle as SourceDocumentStyle,
  ExtractedParagraph,
  ParagraphFormatting,
} from './types'

const EMPTY_FORMATTING: ParagraphFormatting = {
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

function styleChain(
  styleId: string | null,
  styles: SourceDocumentStyle[],
): SourceDocumentStyle[] {
  const chain: SourceDocumentStyle[] = []
  const visited = new Set<string>()
  let current = styleId
  while (current && !visited.has(current)) {
    visited.add(current)
    const style = styles.find((item) => item.id === current)
    if (!style) break
    chain.unshift(style)
    current = style.basedOn
  }
  return chain
}

function mergeFormatting(
  base: Partial<ParagraphFormatting>,
  addition: Partial<ParagraphFormatting>,
): Partial<ParagraphFormatting> {
  const result = { ...base }
  for (const [key, value] of Object.entries(addition)) {
    if (value !== null && value !== undefined) {
      ;(result as Record<string, unknown>)[key] = value
    }
  }
  return result
}

function resolveFormatting(
  paragraph: ExtractedParagraph,
  document: DocumentRepresentation,
): ParagraphFormatting {
  let resolved: Partial<ParagraphFormatting> = {
    ...document.formatting.defaultParagraph,
  }
  for (const style of styleChain(
    paragraph.formatting.styleId,
    document.styles,
  )) {
    resolved = mergeFormatting(resolved, style.formatting)
  }
  const direct: Partial<ParagraphFormatting> = { ...paragraph.formatting }
  if (!paragraph.formatting.bold) delete direct.bold
  if (!paragraph.formatting.italic) delete direct.italic
  if (!paragraph.formatting.underline) delete direct.underline
  resolved = mergeFormatting(resolved, direct)
  return {
    ...EMPTY_FORMATTING,
    ...resolved,
    styleId: paragraph.formatting.styleId,
  }
}

function signature(formatting: ParagraphFormatting): string {
  return JSON.stringify(formatting)
}

function predominant<T>(
  values: Array<{ value: T | null; weight: number }>,
): T | null {
  const counts = new Map<string, { value: T; weight: number }>()
  for (const entry of values) {
    if (entry.value === null) continue
    const key = JSON.stringify(entry.value)
    const current = counts.get(key)
    counts.set(key, {
      value: entry.value,
      weight: (current?.weight ?? 0) + entry.weight,
    })
  }
  return (
    [...counts.values()].sort((a, b) => b.weight - a.weight)[0]?.value ?? null
  )
}

function paragraphWeight(paragraph: ExtractedParagraph): number {
  return Math.max(1, paragraph.text.split(/\s+/).filter(Boolean).length)
}

export class FormattingAnalysisService {
  analyze(document: DocumentRepresentation): FormattingPattern {
    const resolved = new Map(
      document.paragraphs.map((paragraph) => [
        paragraph.id,
        resolveFormatting(paragraph, document),
      ]),
    )
    const sectionName = (sectionId: string | null): string | null =>
      document.sections.find((section) => section.id === sectionId)?.title ??
      null

    const headingGroups = new Map<
      string,
      {
        level: number
        formatting: ParagraphFormatting
        ids: string[]
        sectionNames: string[]
      }
    >()
    const paragraphGroups = new Map<
      string,
      {
        sectionName: string | null
        formatting: ParagraphFormatting
        ids: string[]
      }
    >()
    const captionGroups = new Map<
      string,
      { formatting: ParagraphFormatting; ids: string[] }
    >()
    for (const paragraph of document.paragraphs) {
      const format = resolved.get(paragraph.id) ?? EMPTY_FORMATTING
      if (paragraph.style === 'heading' && paragraph.headingLevel !== null) {
        const key = `${paragraph.headingLevel}:${signature(format)}`
        const group = headingGroups.get(key) ?? {
          level: paragraph.headingLevel,
          formatting: format,
          ids: [],
          sectionNames: [],
        }
        group.ids.push(paragraph.id)
        const name = sectionName(paragraph.sectionId)
        if (name && !group.sectionNames.includes(name))
          group.sectionNames.push(name)
        headingGroups.set(key, group)
      } else if (paragraph.style === 'caption') {
        const key = signature(format)
        const group = captionGroups.get(key) ?? { formatting: format, ids: [] }
        group.ids.push(paragraph.id)
        captionGroups.set(key, group)
      } else if (paragraph.style === 'paragraph') {
        const name = sectionName(paragraph.sectionId)
        const key = `${name ?? ''}:${signature(format)}`
        const group = paragraphGroups.get(key) ?? {
          sectionName: name,
          formatting: format,
          ids: [],
        }
        group.ids.push(paragraph.id)
        paragraphGroups.set(key, group)
      }
    }

    const headingStyles: HeadingStyle[] = [...headingGroups.values()]
      .map((group) => ({
        level: group.level,
        sectionNames: group.sectionNames,
        sourceStyleId: group.formatting.styleId,
        formatting: group.formatting,
        evidence: { elementIds: group.ids, occurrences: group.ids.length },
      }))
      .sort((a, b) => a.level - b.level)
    const paragraphStyles: ParagraphStyle[] = [...paragraphGroups.values()].map(
      (group) => ({
        sectionName: group.sectionName,
        sourceStyleId: group.formatting.styleId,
        formatting: group.formatting,
        evidence: { elementIds: group.ids, occurrences: group.ids.length },
      }),
    )
    const captionStyles: CaptionStyle[] = [...captionGroups.values()].map(
      (group) => ({
        sourceStyleId: group.formatting.styleId,
        formatting: group.formatting,
        evidence: { elementIds: group.ids, occurrences: group.ids.length },
      }),
    )

    const listStyles: ListStyle[] = document.lists.map((list) => {
      const itemParagraphs = list.items
        .map((item) =>
          document.paragraphs.find(
            (paragraph) => paragraph.id === item.paragraphId,
          ),
        )
        .filter((item): item is ExtractedParagraph => item !== undefined)
      const itemFormatting = itemParagraphs[0]
        ? (resolved.get(itemParagraphs[0].id) ?? null)
        : null
      return {
        sourceStyleId: list.styleId,
        ordered: list.ordered,
        format: list.format,
        start: list.start,
        levels: [...new Set(list.items.map((item) => item.level))].sort(
          (a, b) => a - b,
        ),
        itemFormatting,
        evidence: {
          elementIds: [list.id, ...list.items.map((item) => item.id)],
          occurrences: list.items.length,
        },
      }
    })
    const tableStyles: TableStyle[] = document.tables.map((table) => ({
      sourceStyleId: table.styleId,
      alignment: table.alignment,
      headerRows: table.headerRows,
      rowCount: table.rowCount,
      columnCount: table.columnCount,
      evidence: { elementIds: [table.id], occurrences: 1 },
    }))
    const figureStyles: FigureStyle[] = document.figures.map((figure) => ({
      contentType: figure.contentType,
      hasCaption: figure.caption !== null,
      sectionName: sectionName(figure.sectionId),
      evidence: { elementIds: [figure.id], occurrences: 1 },
    }))

    const bodyParagraphs = document.paragraphs.filter(
      (paragraph) =>
        paragraph.style !== 'heading' && paragraph.style !== 'caption',
    )
    const fontValues = bodyParagraphs.map((paragraph) => ({
      value: resolved.get(paragraph.id)?.fontFamily ?? null,
      weight: paragraphWeight(paragraph),
    }))
    const sizeValues = bodyParagraphs.map((paragraph) => ({
      value: resolved.get(paragraph.id)?.fontSizePt ?? null,
      weight: paragraphWeight(paragraph),
    }))
    const sectionFonts = document.sections.map((section) => {
      const items = document.paragraphs.filter(
        (paragraph) =>
          paragraph.sectionId === section.id && paragraph.style !== 'heading',
      )
      return {
        sectionName: section.title,
        fontFamily: predominant(
          items.map((paragraph) => ({
            value: resolved.get(paragraph.id)?.fontFamily ?? null,
            weight: paragraphWeight(paragraph),
          })),
        ),
        fontSizePt: predominant(
          items.map((paragraph) => ({
            value: resolved.get(paragraph.id)?.fontSizePt ?? null,
            weight: paragraphWeight(paragraph),
          })),
        ),
      }
    })

    return {
      documentStyle: {
        predominantFont: predominant(fontValues),
        predominantFontSizePt: predominant(sizeValues),
        sectionFonts,
        pageWidthPt: document.pageInformation.widthPt,
        pageHeightPt: document.pageInformation.heightPt,
        orientation: document.pageInformation.orientation,
        margins: { ...document.pageInformation.margins },
        hasPageNumbering: document.pageInformation.hasPageNumbering,
        pageBreakCount: document.pageInformation.pageBreakCount,
        pageBreakBeforeSections: document.paragraphs
          .filter((paragraph) => paragraph.pageBreakBefore)
          .map((paragraph) => sectionName(paragraph.sectionId))
          .filter((name): name is string => name !== null),
      },
      headingStyles,
      paragraphStyles,
      listStyles,
      tableStyles,
      figureStyles,
      captionStyles,
      headerStyles: document.headers.map((header) => ({
        variant: header.variant,
        paragraphCount: header.paragraphs.length,
        text: header.text,
        formatting: header.formatting?.[0] ?? null,
        evidence: { elementIds: [header.id], occurrences: 1 },
      })),
      footerStyles: document.footers.map((footer) => ({
        variant: footer.variant,
        paragraphCount: footer.paragraphs.length,
        text: footer.text,
        containsPageNumber: /\bPAGE\b/i.test(footer.text),
        formatting: footer.formatting?.[0] ?? null,
        evidence: { elementIds: [footer.id], occurrences: 1 },
      })),
      sourceStyleIds: [...new Set(document.styles.map((style) => style.id))],
    }
  }
}
