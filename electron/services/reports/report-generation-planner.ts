import type {
  SectionPattern,
  SectionSemanticPattern,
  StructureField,
} from '../../../src/domain/templates'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { getReportUnit } from '../../../src/domain/templates/report-unit'
import type {
  MissingRequiredInformation,
  PlannedReportSection,
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../src/types/generated-report'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('ReportGenerationPlanner')

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '')
}

function hasFact(information: StructuredActivity, ...names: string[]): boolean {
  const candidates = names.map(normalize).filter(Boolean)
  return information.facts.some((fact) => {
    const factNames = [normalize(fact.name), normalize(fact.label)]
    return candidates.some((candidate) =>
      factNames.some(
        (factName) =>
          factName === candidate ||
          factName.includes(candidate) ||
          candidate.includes(factName),
      ),
    )
  })
}

function missingField(field: StructureField): MissingRequiredInformation {
  return {
    fieldId: `field:${normalize(field.name)}`,
    fieldName: field.name,
    label: field.label,
    question: `Informe ${field.label || field.name}.`,
  }
}

function hasExpectedInformation(
  type: SectionSemanticPattern['expectedInformation'][number]['informationType'],
  name: string,
  description: string,
  information: StructuredActivity,
): boolean {
  if (type === 'action') return information.activities.length > 0
  if (type === 'procedure')
    return information.activities.some((activity) => activity.procedures.length)
  if (type === 'result' || type === 'validation')
    return information.activities.some((activity) => activity.result !== null)
  if (type === 'cause')
    return information.activities.some((activity) => activity.problems.length)
  return hasFact(information, name, description)
}

function activityIndexes(
  semantics: SectionSemanticPattern | null,
  information: StructuredActivity,
): number[] {
  const types = semantics?.expectedInformation.map(
    (expected) => expected.informationType,
  ) ?? ['action']
  return information.activities.flatMap((activity, index) => {
    const relevant = types.some((type) => {
      if (type === 'result' || type === 'validation')
        return activity.result !== null
      if (type === 'cause') return activity.problems.length > 0
      if (type === 'procedure') return activity.procedures.length > 0
      return true
    })
    return relevant ? [index] : []
  })
}

interface FlatSection {
  sourceName?: string
  section: SectionPattern
  parentSectionId: string | null
  sectionId: string
}

interface AggregateReportUnit {
  sectionIds: Set<string>
  title: string
}

function flattenSections(template: ReportTemplate): FlatSection[] {
  const source = template.structurePattern.hierarchy.length
    ? template.structurePattern.hierarchy
    : template.structurePattern.sections
  const result: FlatSection[] = []
  const visit = (
    section: SectionPattern,
    parentSectionId: string | null,
    path: string,
  ): void => {
    const sectionId = `${path}${section.order}:${normalize(section.name)}`
    result.push({ section, parentSectionId, sectionId })
    for (const child of [...section.children].sort((a, b) => a.order - b.order))
      visit(child, sectionId, `${sectionId}/`)
  }
  for (const section of [...source].sort((a, b) => a.order - b.order))
    visit(section, null, '')
  return result
}

function aggregateSectionTitle(sectionName: string): string | null {
  const match = sectionName.match(
    /^\s*(.+?)\s+(?:n[ºo.]?\s*)?\d+(?:\s|$|[—–-])/i,
  )
  if (!match?.[1]) return null
  return match[1].trim()
}

/** A collection of numbered reports contributes one representative unit. */
function aggregateReportUnit(
  sections: FlatSection[],
): AggregateReportUnit | null {
  const groups = new Map<string, FlatSection[]>()
  for (const item of sections) {
    if (item.parentSectionId !== null) continue
    const title = aggregateSectionTitle(item.section.name)
    if (!title) continue
    const values = groups.get(title) ?? []
    values.push(item)
    groups.set(title, values)
  }
  const group = [...groups.entries()]
    .filter(([, values]) => values.length > 1)
    .sort(([, left], [, right]) => right.length - left.length)[0]
  if (!group) return null

  const [title, roots] = group
  // A number alone does not distinguish a collection from ordinary chapters.
  // Older templates must also carry a repeated ordered subsection structure.
  const sequence = roots[0]!.section.children.map((child) =>
    normalize(child.name),
  )
  if (
    sequence.length < 2 ||
    !roots.every(
      (item) =>
        JSON.stringify(
          item.section.children.map((child) => normalize(child.name)),
        ) === JSON.stringify(sequence),
    )
  )
    return null
  const childrenByParent = new Map<string, FlatSection[]>()
  for (const item of sections) {
    if (!item.parentSectionId) continue
    const values = childrenByParent.get(item.parentSectionId) ?? []
    values.push(item)
    childrenByParent.set(item.parentSectionId, values)
  }
  const representative = [...roots].sort(
    (left, right) => left.section.order - right.section.order,
  )[0]
  if (!representative) return null
  const sectionIds = new Set<string>()
  const visit = (sectionId: string): void => {
    sectionIds.add(sectionId)
    for (const child of childrenByParent.get(sectionId) ?? [])
      visit(child.sectionId)
  }
  visit(representative.sectionId)
  return { sectionIds, title }
}

export class ReportGenerationPlanner {
  plan(
    information: StructuredActivity,
    template: ReportTemplate,
  ): ReportGenerationPlan {
    const timer = logger.startTimer('Report planning', {
      templateId: template.metadata.id,
      activities: information.activities.length,
    })
    const flattenedSections = flattenSections(template)
    const layout = template.formattingPattern.docxLayout
    const reportUnit = getReportUnit(template)
    const aggregateUnit =
      layout || reportUnit ? null : aggregateReportUnit(flattenedSections)
    const sourceSections: FlatSection[] = reportUnit
      ? reportUnit.sections.map((item, index) => ({
          sectionId: `report-section-${index + 1}`,
          parentSectionId: null,
          sourceName: item.sourceSectionName,
          section: {
            name: item.name,
            level: 1,
            order: index + 1,
            purpose: item.name,
            required: true,
            repeatable: false,
            children: [],
          },
        }))
      : aggregateUnit
        ? flattenedSections.filter((item) =>
            aggregateUnit.sectionIds.has(item.sectionId),
          )
        : flattenedSections
    const sourceSectionNames = new Set(
      sourceSections.map((item) => normalize(item.section.name)),
    )
    // Repeated author/date labels in an archive are sample metadata, not an
    // instruction to require those same values for a new independent report.
    const missing = (reportUnit ? [] : template.fields)
      .filter(
        (field) =>
          field.required && !hasFact(information, field.name, field.label),
      )
      .map(missingField)

    for (const semanticSection of template.semanticPattern.sections) {
      if (reportUnit) continue
      if (
        aggregateUnit &&
        !sourceSectionNames.has(normalize(semanticSection.sectionName))
      )
        continue
      for (const expected of semanticSection.expectedInformation) {
        if (
          expected.required &&
          !hasExpectedInformation(
            expected.informationType,
            expected.name,
            expected.description,
            information,
          )
        ) {
          const fieldId = `semantic:${normalize(semanticSection.sectionName)}:${normalize(expected.name)}`
          if (
            !missing.some(
              (item) => normalize(item.fieldName) === normalize(expected.name),
            )
          )
            missing.push({
              fieldId,
              fieldName: expected.name,
              label: expected.name,
              question: `Informe ${expected.description || expected.name}.`,
            })
        }
      }
    }
    if (information.activities.length === 0)
      missing.unshift({
        fieldId: 'activity',
        fieldName: 'activity',
        label: 'Atividade realizada',
        question: 'Descreva qual atividade foi realizada.',
      })

    const factNames = [...new Set(information.facts.map((fact) => fact.name))]
    const sections: PlannedReportSection[] = sourceSections.map(
      ({ section, parentSectionId, sectionId, sourceName }) => {
        const semantics = reportUnit
          ? null
          : (template.semanticPattern.sections.find(
              (item) => normalize(item.sectionName) === normalize(section.name),
            ) ?? null)
        return {
          sectionId,
          sectionName:
            aggregateUnit && parentSectionId === null
              ? aggregateUnit.title
              : section.name,
          order: section.order,
          level: section.level,
          parentSectionId,
          required: section.required,
          repeatable: section.repeatable,
          purpose: section.purpose,
          structure: sourceName ? { ...section, name: sourceName } : section,
          writingStyle:
            template.writingPattern.sectionStyles.find(
              (item) =>
                normalize(item.sectionName) ===
                normalize(sourceName ?? section.name),
            ) ?? null,
          semantics,
          formatting: {
            headingStyles: template.formattingPattern.headingStyles.filter(
              (style) =>
                style.sectionNames.some(
                  (name) =>
                    normalize(name) === normalize(sourceName ?? section.name),
                ),
            ),
            paragraphStyles: template.formattingPattern.paragraphStyles.filter(
              (style) =>
                style.sectionName !== null &&
                normalize(style.sectionName) ===
                  normalize(sourceName ?? section.name),
            ),
          },
          factNames,
          activityIndexes: activityIndexes(semantics, information),
        }
      },
    )

    const plan: ReportGenerationPlan = {
      missing,
      sections,
      groundingPolicy: {
        sourceOfFacts: 'structured-activity-only',
        templateIsNotFactSource: true,
        requireEvidence: true,
        prohibitUnsupportedFacts: true,
      },
      templateContext: {
        structurePattern: template.structurePattern,
        fields: template.fields,
        activityPatterns: template.activityPatterns,
        requirements: template.requirements,
        writingPattern: template.writingPattern,
        semanticPattern: template.semanticPattern,
        crossSectionRelations: template.semanticPattern.crossSectionRelations,
        formattingPattern: template.formattingPattern,
      },
    }
    timer.end('Report planning completed', {
      sections: plan.sections.length,
      missing: plan.missing.length,
      aggregateTemplate: reportUnit !== null || aggregateUnit !== null,
    })
    return plan
  }
}
