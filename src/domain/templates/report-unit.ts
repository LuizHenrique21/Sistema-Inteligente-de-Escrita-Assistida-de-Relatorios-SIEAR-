import type { ReportTemplate } from './report-template'

export interface ReportUnitPattern {
  detection: 'repeated-section-sequence'
  instances: number
  sections: Array<{ name: string; sourceSectionName: string }>
}

/** One independent report, distinct from the full imported archive. */
export function getReportUnit(
  template: ReportTemplate,
): ReportUnitPattern | null {
  const layout = template.formattingPattern.docxLayout
  if (layout)
    return layout.collection
      ? { ...layout.collection, sections: layout.sections }
      : null
  return template.structurePattern.reportUnit ?? null
}
