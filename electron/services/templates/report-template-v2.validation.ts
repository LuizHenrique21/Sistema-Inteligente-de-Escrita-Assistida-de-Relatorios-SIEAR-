import {
  REPORT_TEMPLATE_V2_VERSION,
  type ReportTemplateV2,
} from './report-template-v2.types'

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}

export function isReportTemplateV2(value: unknown): value is ReportTemplateV2 {
  if (!isRecord(value) || value.version !== REPORT_TEMPLATE_V2_VERSION)
    return false
  if (!isRecord(value.metadata)) return false
  const metadata = value.metadata
  if (
    !isNonEmptyString(metadata.id) ||
    !isNonEmptyString(metadata.name) ||
    !isNonEmptyString(metadata.description) ||
    !isNonEmptyString(metadata.documentType) ||
    !isNonEmptyString(metadata.createdAt) ||
    !isNonEmptyString(metadata.updatedAt) ||
    (metadata.status !== 'draft' && metadata.status !== 'confirmed')
  )
    return false
  if (
    !isRecord(value.structurePattern) ||
    !Array.isArray(value.structurePattern.sections) ||
    !Array.isArray(value.structurePattern.hierarchy) ||
    !isRecord(value.writingPattern) ||
    !Array.isArray(value.writingPattern.sectionStyles) ||
    !isRecord(value.semanticPattern) ||
    !Array.isArray(value.semanticPattern.sections) ||
    !isRecord(value.formattingPattern) ||
    !isRecord(value.formattingPattern.documentStyle) ||
    !Array.isArray(value.fields) ||
    !Array.isArray(value.activityPatterns) ||
    !isRecord(value.requirements) ||
    !Array.isArray(value.requirements.requiredElements) ||
    !Array.isArray(value.requirements.optionalElements) ||
    !Array.isArray(value.requirements.repeatableElements)
  )
    return false
  return true
}
