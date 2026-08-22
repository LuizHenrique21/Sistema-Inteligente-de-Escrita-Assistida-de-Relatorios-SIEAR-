import type {
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/types/report-template'

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '')
}

function sectionActivityIndexes(
  name: string,
  information: StructuredActivity,
): number[] {
  const normalized = normalize(name)
  if (/resultado|conclusao|validacao/.test(normalized))
    return information.activities.flatMap((activity, index) =>
      activity.result ? [index] : [],
    )
  if (/problema|justificativa|motivacao/.test(normalized))
    return information.activities.flatMap((activity, index) =>
      activity.problems.length ? [index] : [],
    )
  if (/atividade|descricao|procedimento|execucao|metodologia/.test(normalized))
    return information.activities.map((_, index) => index)
  return information.activities.map((_, index) => index)
}

export class ReportGenerationPlanner {
  plan(
    information: StructuredActivity,
    template: ReportTemplate,
  ): ReportGenerationPlan {
    const factByName = new Map<string, string>()
    for (const fact of information.facts) {
      factByName.set(normalize(fact.name), fact.name)
      factByName.set(normalize(fact.label), fact.name)
    }
    const missing = template.fields
      .filter(
        (field) =>
          field.required &&
          !factByName.has(normalize(field.name)) &&
          !factByName.has(normalize(field.label)),
      )
      .map((field) => ({
        fieldId: field.id,
        fieldName: field.name,
        label: field.label,
        question: `Informe ${field.label || field.name}.`,
      }))
    if (information.activities.length === 0) {
      missing.unshift({
        fieldId: 'activity',
        fieldName: 'activity',
        label: 'Atividade realizada',
        question: 'Descreva qual atividade foi realizada.',
      })
    }
    const factNames = [...new Set(information.facts.map((fact) => fact.name))]
    return {
      missing,
      sections: [...template.sections]
        .sort((a, b) => a.order - b.order)
        .map((section) => ({
          sectionId: section.id,
          sectionName: section.name,
          order: section.order,
          factNames,
          activityIndexes: sectionActivityIndexes(section.name, information),
        })),
    }
  }
}
