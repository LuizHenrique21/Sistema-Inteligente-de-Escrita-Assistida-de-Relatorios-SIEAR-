import { randomUUID } from 'node:crypto'
import type { ReportTemplate } from '../../../src/types/report-template'
import type { TemplateAnalysis } from '../../../src/types/template-import'

export class TemplateMapper {
  toReportTemplate(analysis: TemplateAnalysis): ReportTemplate {
    return {
      id: randomUUID(),
      name: analysis.name,
      description: analysis.description,
      objective: analysis.objective,
      tone: analysis.tone,
      style: analysis.style,
      formality: analysis.formality,
      sections: analysis.sections.map((section) => ({
        id: randomUUID(),
        ...section,
      })),
      fields: analysis.fields.map((field) => ({ id: randomUUID(), ...field })),
      writingRules: [...analysis.writingRules],
      recommendedVocabulary: [...analysis.recommendedVocabulary],
      forbiddenExpressions: [...analysis.forbiddenExpressions],
    }
  }
}
