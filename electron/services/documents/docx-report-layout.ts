import path from 'node:path'
import JSZip from 'jszip'
import type {
  DocxParagraphLayout,
  DocxReportLayout,
  DocxReportSectionLayout,
} from '../../../src/domain/templates/docx-layout'
import type { DocumentRepresentation } from './types'
import {
  detectReportCollection,
  isReportPlaceholder as placeholder,
} from './report-collection-detection'

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

function text(xml: string): string {
  return [...xml.matchAll(/<w:t\b[^>]*>([\s\S]*?)<\/w:t>/g)]
    .map((item) => item[1])
    .join('')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .trim()
}

function paragraphLayout(xml: string): DocxParagraphLayout {
  const properties = xml.match(/<w:pPr\b[\s\S]*?<\/w:pPr>/)?.[0] ?? ''
  const run =
    xml.replace(properties, '').match(/<w:rPr\b[\s\S]*?<\/w:rPr>/)?.[0] ?? ''
  return {
    // Breaks between archived reports do not belong inside a new report.
    properties: properties
      .replace(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g, '')
      .replace(/<w:pageBreakBefore\b[^>]*\/>/g, ''),
    runProperties: run,
  }
}

export function layoutParagraph(
  value: string,
  layout: DocxParagraphLayout,
): string {
  return `<w:p>${layout.properties}<w:r>${layout.runProperties}<w:t xml:space="preserve">${escapeXml(value)}</w:t></w:r></w:p>`
}

interface SourceParagraph {
  text: string
  xml: string
  parent: string
}

function sectionsFromLabels(
  paragraphs: SourceParagraph[],
  starts: number[],
  end: number,
): DocxReportSectionLayout[] {
  return starts.map((start, index) => {
    const heading = paragraphs[start]!
    const body = paragraphs
      .slice(start + 1, starts[index + 1] ?? end)
      .filter(
        (item) =>
          item.text &&
          !placeholder(item.text) &&
          !/^[^:]{2,40}:\s*\S/.test(item.text) &&
          !/^\[.*\]/.test(item.text),
      )
    // Prefer prose over a label, bullet, caption or empty paragraph.
    const prose = body.filter(
      (item) => !/<w:numPr\b|<w:drawing\b/.test(item.xml),
    )
    const representative = [...(prose.length ? prose : body)].sort(
      (a, b) => b.text.length - a.text.length,
    )[0]
    return {
      name: heading.text,
      sourceSectionName: heading.parent || heading.text,
      heading: paragraphLayout(heading.xml),
      paragraph: paragraphLayout(representative?.xml ?? '<w:p/>'),
      sampleWords: body
        .map((item) => item.text)
        .join(' ')
        .split(/\s+/)
        .filter(Boolean).length,
    }
  })
}

/** Recognizes repeated internal label sequences, not just numbered sprint titles. */
export async function learnDocxReportLayout(
  zip: JSZip,
  documentXml: string,
  document: Pick<DocumentRepresentation, 'sections'>,
): Promise<DocxReportLayout | undefined> {
  const body =
    documentXml.match(/<w:body\b[^>]*>([\s\S]*?)<\/w:body>/)?.[1] ?? ''
  // Complex table-based templates continue through the structured renderer.
  if (/<w:tbl\b/.test(body)) return undefined
  let parent = ''
  const headingNames = new Set(
    document.sections.map((section) => section.title),
  )
  const paragraphs: SourceParagraph[] = [
    ...body.matchAll(/<w:p\b[\s\S]*?<\/w:p>/g),
  ].map((item) => {
    const value = text(item[0])
    if (headingNames.has(value)) parent = value
    return { xml: item[0], text: value, parent }
  })
  const selected = detectReportCollection(
    paragraphs.map((item) => ({
      text: item.text,
      excluded: /<w:numPr\b|<w:hyperlink\b|<w:drawing\b/.test(item.xml),
    })),
    headingNames,
  )
  let selectedSections: DocxReportSectionLayout[]
  let collection: DocxReportLayout['collection'] = null
  if (selected) {
    selectedSections = sectionsFromLabels(
      paragraphs,
      selected.indexes,
      selected.end,
    )
    collection = {
      instances: selected.instances,
      detection: 'repeated-section-sequence',
    }
  } else {
    const indexes = paragraphs.flatMap((item, index) =>
      headingNames.has(item.text) ? [index] : [],
    )
    if (!indexes.length) return undefined
    selectedSections = sectionsFromLabels(
      paragraphs,
      indexes,
      paragraphs.length,
    )
  }
  if (!selectedSections.length) return undefined
  const firstHeading = paragraphs.findIndex((item) =>
    headingNames.has(item.text),
  )
  const titleParagraph = paragraphs
    .slice(0, Math.max(0, firstHeading))
    .find((item) => /relat[oó]rio/i.test(item.text) && item.text.length < 160)
  const sanitized = new JSZip()
  const copied = new Set<string>()
  // Only parts used by presentation are carried over. Body images, comments,
  // sample paragraphs and archived reports are not copied into a new report.
  const copyPart = async (name: string): Promise<void> => {
    if (copied.has(name) || !zip.file(name)) return
    if (
      !/^(?:word\/(?:styles\.xml|numbering\.xml|settings\.xml|fontTable\.xml|theme\/[^/]+\.xml|header\d+\.xml|footer\d+\.xml|media\/[^/]+|fonts\/[^/]+))$/.test(
        name,
      )
    )
      return
    copied.add(name)
    sanitized.file(name, await zip.file(name)!.async('nodebuffer'))
    const relName = `${path.posix.dirname(name)}/_rels/${path.posix.basename(name)}.rels`
    const rels = await zip.file(relName)?.async('text')
    if (!rels) return
    const kept: string[] = []
    for (const rel of rels.match(/<Relationship\b[^>]*\/>/g) ?? []) {
      if (/TargetMode="External"/.test(rel)) continue
      const target = rel.match(/Target="([^"]+)"/)?.[1]
      if (!target) continue
      const resolved = target.startsWith('/')
        ? target.slice(1)
        : path.posix.normalize(
            path.posix.join(path.posix.dirname(name), target),
          )
      await copyPart(resolved)
      if (copied.has(resolved)) kept.push(rel)
    }
    sanitized.file(
      relName,
      `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${kept.join('')}</Relationships>`,
    )
  }
  const documentRels =
    (await zip.file('word/_rels/document.xml.rels')?.async('text')) ?? ''
  const kept: string[] = []
  for (const rel of documentRels.match(/<Relationship\b[^>]*\/>/g) ?? []) {
    if (
      /TargetMode="External"/.test(rel) ||
      !/Type="[^"]*\/(?:styles|numbering|settings|fontTable|theme|header|footer)"/.test(
        rel,
      )
    )
      continue
    const target = rel.match(/Target="([^"]+)"/)?.[1]
    if (!target) continue
    const resolved = target.startsWith('/')
      ? target.slice(1)
      : path.posix.normalize(path.posix.join('word', target))
    await copyPart(resolved)
    if (copied.has(resolved)) kept.push(rel)
  }
  // Some producers omit a styles relationship; retain the definitions anyway.
  await copyPart('word/styles.xml')
  const sectionProperties =
    [...body.matchAll(/<w:sectPr\b[\s\S]*?<\/w:sectPr>/g)].at(-1)?.[0] ?? ''
  sanitized.file(
    'word/document.xml',
    documentXml.replace(
      /<w:body\b[^>]*>[\s\S]*?<\/w:body>/,
      `<w:body>${sectionProperties}</w:body>`,
    ),
  )
  copied.add('word/document.xml')
  sanitized.file(
    'word/_rels/document.xml.rels',
    `<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${kept.join('')}</Relationships>`,
  )
  sanitized.file(
    '_rels/.rels',
    '<?xml version="1.0"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  )
  const contentTypes =
    (await zip.file('[Content_Types].xml')?.async('text')) ?? ''
  sanitized.file(
    '[Content_Types].xml',
    contentTypes.replace(/<Override\b[^>]*\/>/g, (entry) =>
      copied.has(entry.match(/PartName="\/([^"]+)"/)?.[1] ?? '') ? entry : '',
    ),
  )
  return {
    version: 1,
    packageBase64: await sanitized.generateAsync({
      type: 'base64',
      compression: 'DEFLATE',
    }),
    title: titleParagraph
      ? {
          text: titleParagraph.text,
          layout: paragraphLayout(titleParagraph.xml),
        }
      : null,
    sections: selectedSections,
    collection,
  }
}
