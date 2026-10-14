import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { getLogger } from '../../infrastructure/logging/logger.runtime'
import {
  detectReportCollection,
  isReportPlaceholder,
} from '../documents/report-collection-detection'
import { isCheckpointDocument } from './pipeline-checkpoint.validation'

const logger = getLogger('LegacyReportUnit')

/** Enriches a copy at read time. Does not rewrite confirmed templates or checkpoints. */
export async function recoverLegacyReportUnit(
  template: ReportTemplate,
  findSource: (templateId: string) => Promise<unknown>,
): Promise<ReportTemplate> {
  if (
    template.formattingPattern.docxLayout ||
    template.structurePattern.reportUnit
  )
    return template
  const source = await findSource(template.metadata.id)
  if (!isCheckpointDocument(source) || source.tables.length) return template
  // Do not reinterpret an edited template using an unrelated/stale extraction.
  if (
    JSON.stringify(
      template.structurePattern.sections.map((section) => section.name),
    ) !== JSON.stringify(source.sections.map((section) => section.title))
  )
    return template
  const paragraphs = [...source.paragraphs].sort((a, b) => a.order - b.order)
  const detected = detectReportCollection(
    paragraphs.map((paragraph) => ({
      text: paragraph.text,
      excluded:
        paragraph.style === 'list-item' ||
        paragraph.style === 'caption' ||
        paragraph.numbering !== null,
    })),
    new Set(source.sections.map((section) => section.title)),
  )
  if (!detected) return template
  const result = structuredClone(template)
  const sections = detected.indexes.map((start, index) => {
    const heading = paragraphs[start]!
    const sourceSectionName =
      source.sections.find((section) => section.id === heading.sectionId)
        ?.title ?? heading.text
    const prose = paragraphs
      .slice(start + 1, detected.indexes[index + 1] ?? detected.end)
      .filter(
        (paragraph) =>
          paragraph.text.trim() &&
          !isReportPlaceholder(paragraph.text) &&
          paragraph.style === 'paragraph' &&
          !/^[^:]{2,40}:\s*\S|^\[/.test(paragraph.text),
      )
      .sort((a, b) => b.text.length - a.text.length)[0]
    result.formattingPattern.headingStyles.push({
      sectionNames: [heading.text],
      level: 1,
      sourceStyleId: heading.formatting.styleId,
      formatting: { ...heading.formatting },
      evidence: { elementIds: [heading.id], occurrences: 1 },
    })
    if (prose)
      result.formattingPattern.paragraphStyles.push({
        sectionName: heading.text,
        sourceStyleId: prose.formatting.styleId,
        formatting: { ...prose.formatting },
        evidence: { elementIds: [prose.id], occurrences: 1 },
      })
    return { name: heading.text, sourceSectionName }
  })
  result.structurePattern.reportUnit = {
    detection: 'repeated-section-sequence',
    instances: detected.instances,
    sections,
  }
  logger.info('Legacy report unit recovered', {
    templateId: template.metadata.id,
    archiveSections: template.structurePattern.sections.length,
    reportSections: sections.length,
    instances: detected.instances,
  })
  return result
}
