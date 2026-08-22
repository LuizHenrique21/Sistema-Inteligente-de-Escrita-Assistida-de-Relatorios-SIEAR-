import { randomUUID } from 'node:crypto'
import type {
  ReportActivityPattern,
  ReportHierarchyNode,
  ReportSection,
  ReportTemplate,
} from '../../../src/types/report-template'
import type { FormattingPattern } from '../documents/formatting-analysis.types'
import type { SemanticPattern } from '../documents/semantic-analysis.types'
import type {
  SectionPattern,
  StructurePattern,
} from '../documents/structure-analysis.types'
import type { DocumentRepresentation } from '../documents/types'
import type { WritingPattern } from '../documents/writing-analysis.types'
import {
  REPORT_TEMPLATE_V2_VERSION,
  type ReportTemplateV2,
  type ReportTemplateV2Requirements,
} from './report-template-v2.types'

export interface ReportTemplateBuilderInput {
  document: DocumentRepresentation
  structure: StructurePattern
  writing: WritingPattern
  semantic: SemanticPattern
  formatting: FormattingPattern
}

function normalized(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function reusableName(section: SectionPattern): string {
  if (!section.repeatable) return section.name
  return section.name
    .replace(/\s+(?:n[º°.]?\s*)?\d+\s*$/i, '')
    .replace(/\s+[ivxlcdm]+\s*$/i, '')
    .trim()
}

function styleDescription(
  sectionName: string,
  writing: WritingPattern,
): string {
  const style = writing.sectionStyles.find(
    (item) => normalized(item.sectionName) === normalized(sectionName),
  )
  if (!style) return ''
  return [
    `tom ${style.tone}`,
    `formalidade ${style.formality}`,
    `tecnicidade ${style.technicality}`,
    `objetividade ${style.objectivity}`,
    `narrativa ${style.narrativeStyle}`,
    `detalhamento ${style.detailLevel}`,
  ].join('; ')
}

function formattingDescription(
  section: SectionPattern,
  formatting: FormattingPattern,
): string {
  const heading = formatting.headingStyles.find(
    (style) => style.level === section.level,
  )
  if (!heading) return ''
  const value = heading.formatting
  return [
    value.fontFamily ? `fonte ${value.fontFamily}` : null,
    value.fontSizePt !== null ? `${value.fontSizePt} pt` : null,
    value.bold ? 'negrito' : null,
    value.italic ? 'itálico' : null,
    value.underline ? 'sublinhado' : null,
    value.alignment ? `alinhamento ${value.alignment}` : null,
  ]
    .filter((item): item is string => item !== null)
    .join('; ')
}

function buildSections(
  structure: StructurePattern,
  writing: WritingPattern,
  semantic: SemanticPattern,
  formatting: FormattingPattern,
): { sections: ReportSection[]; hierarchy: ReportHierarchyNode[] } {
  const sections: ReportSection[] = []
  const roots: ReportHierarchyNode[] = []
  const keyToSection = new Map<string, ReportSection>()

  const visit = (
    patterns: SectionPattern[],
    parent: ReportSection | null,
    hierarchyTarget: ReportHierarchyNode[],
  ): void => {
    for (const pattern of patterns) {
      const name = reusableName(pattern)
      const key = `${parent?.id ?? 'root'}:${normalized(name)}`
      let section = keyToSection.get(key)
      let node: ReportHierarchyNode
      if (!section) {
        const semanticSection = semantic.sections.find(
          (item) => normalized(item.sectionName) === normalized(pattern.name),
        )
        section = {
          id: randomUUID(),
          name,
          description:
            semanticSection?.purpose ??
            pattern.purpose ??
            'Finalidade a revisar.',
          required: pattern.required,
          order: sections.length + 1,
          parentSectionId: parent?.id ?? null,
          level: pattern.level,
          repeatable: pattern.repeatable,
          semanticPurpose: semanticSection?.purpose ?? pattern.purpose ?? '',
          writingStyle: styleDescription(pattern.name, writing),
          formattingStyle: formattingDescription(pattern, formatting),
        }
        keyToSection.set(key, section)
        sections.push(section)
        node = { sectionId: section.id, children: [] }
        hierarchyTarget.push(node)
      } else {
        section.repeatable = true
        node = hierarchyTarget.find(
          (item) => item.sectionId === section?.id,
        ) ?? {
          sectionId: section.id,
          children: [],
        }
        if (!hierarchyTarget.includes(node)) hierarchyTarget.push(node)
      }
      visit(pattern.children, section, node.children)
    }
  }
  visit(structure.hierarchy, null, roots)

  for (const pattern of structure.sections) {
    if (
      !sections.some(
        (section) =>
          normalized(section.name) === normalized(reusableName(pattern)),
      )
    ) {
      visit([pattern], null, roots)
    }
  }
  return { sections, hierarchy: roots }
}

function unique(values: string[]): string[] {
  return [...new Set(values.map((value) => value.trim()).filter(Boolean))]
}

function formattingRules(pattern: FormattingPattern): string[] {
  const document = pattern.documentStyle
  return unique([
    document.predominantFont
      ? `Utilizar predominantemente a fonte ${document.predominantFont}.`
      : '',
    document.predominantFontSizePt !== null
      ? `Utilizar tamanho predominante de ${document.predominantFontSizePt} pt.`
      : '',
    document.orientation
      ? `Configurar orientação da página como ${document.orientation}.`
      : '',
    `Configurar margens: superior ${document.margins.topPt ?? 'não definida'} pt, direita ${document.margins.rightPt ?? 'não definida'} pt, inferior ${document.margins.bottomPt ?? 'não definida'} pt e esquerda ${document.margins.leftPt ?? 'não definida'} pt.`,
    ...pattern.headingStyles.map(
      (style) =>
        `Heading nível ${style.level}: ${style.formatting.fontFamily ?? 'fonte herdada'}, ${style.formatting.fontSizePt ?? 'tamanho herdado'} pt, ${style.formatting.bold ? 'negrito' : 'sem negrito'}, alinhamento ${style.formatting.alignment ?? 'herdado'}.`,
    ),
    ...pattern.listStyles.map(
      (style) =>
        `Lista ${style.ordered ? 'ordenada' : 'não ordenada'} com formato ${style.format ?? 'herdado'} e níveis ${style.levels.join(', ')}.`,
    ),
    ...pattern.tableStyles.map(
      (style) =>
        `Tabela com estilo ${style.sourceStyleId ?? 'herdado'}, alinhamento ${style.alignment ?? 'herdado'} e ${style.headerRows} linha(s) de cabeçalho.`,
    ),
  ])
}

function buildV2Requirements(
  structure: StructurePattern,
): ReportTemplateV2Requirements {
  return {
    requiredElements: [...structure.requiredElements],
    optionalElements: [...structure.optionalElements],
    repeatableElements: unique([
      ...structure.sections
        .filter((section) => section.repeatable)
        .map((section) => section.name),
      ...structure.activityPatterns
        .filter((activity) => activity.repeatable)
        .map((activity) => activity.namePattern),
      ...structure.recurringElements.map((element) => element.name),
    ]),
  }
}

export class ReportTemplateBuilder {
  build(input: ReportTemplateBuilderInput): ReportTemplate {
    const { structure, writing, semantic, formatting } = input
    const built = buildSections(structure, writing, semantic, formatting)
    const fields = structure.fields.map((field) => {
      const semanticField = semantic.fields.find(
        (item) => item.name === field.name || item.label === field.label,
      )
      return {
        id: randomUUID(),
        name: field.name,
        label: field.label,
        type: field.type,
        required: semanticField?.required ?? field.required,
        description:
          semanticField?.semanticRole ??
          `Campo variável identificado como ${field.label}.`,
      }
    })
    const fieldIdByName = new Map<string, string>(
      fields.map((field) => [field.name, field.id]),
    )
    const activities: ReportActivityPattern[] = structure.activityPatterns.map(
      (activity) => ({
        namePattern: activity.namePattern,
        sectionNames: [...activity.sections],
        order: activity.order,
        repeatable: activity.repeatable,
        fieldIds: activity.fields
          .map((field) => fieldIdByName.get(field.name))
          .filter((id): id is string => id !== undefined),
      }),
    )
    const writingRules = unique([
      ...writing.recommendedPatterns.map((item) => item.rule),
      ...writing.sentencePatterns.map((item) => item.rule),
      ...writing.paragraphPatterns.map((item) => item.rule),
      ...writing.narrativePatterns.map((item) => item.rule),
    ])
    const semanticRules = unique([
      ...semantic.sections.flatMap((section) => [
        `${section.sectionName}: ${section.purpose}`,
        ...section.expectedInformation.map(
          (information) =>
            `${section.sectionName} deve conter ${information.name}: ${information.description}`,
        ),
      ]),
      ...semantic.crossSectionRelations.map(
        (relation) =>
          `Relacionar com ${relation.targetSection}: ${relation.relationship}`,
      ),
    ])
    const repeatableElements = unique([
      ...built.sections
        .filter((section) => section.repeatable)
        .map((section) => section.name),
      ...activities.map((activity) => activity.namePattern),
    ])

    return {
      id: randomUUID(),
      name: `Modelo de ${structure.documentType}`,
      description: `Padrão reutilizável aprendido a partir de um único documento do tipo ${structure.documentType}.`,
      objective: `Produzir novos documentos compatíveis com o padrão ${structure.documentType}, sem reutilizar dados específicos do documento original.`,
      tone: writing.globalStyle.tone,
      style: writing.globalStyle.narrativeStyle,
      formality: normalized(writing.globalStyle.formality).includes('alta')
        ? 'high'
        : normalized(writing.globalStyle.formality).includes('baixa')
          ? 'low'
          : 'medium',
      sections: built.sections,
      fields,
      writingRules,
      recommendedVocabulary: unique(
        writing.vocabulary.map((item) => item.rule),
      ),
      forbiddenExpressions: unique(
        writing.forbiddenPatterns.map((item) => item.rule),
      ),
      documentType: structure.documentType,
      status: 'draft',
      hierarchy: built.hierarchy,
      activityPatterns: activities,
      semanticRules,
      formattingRules: formattingRules(formatting),
      requiredElements: unique(structure.requiredElements),
      optionalElements: unique(structure.optionalElements),
      repeatableElements,
    }
  }

  buildV2(input: ReportTemplateBuilderInput): ReportTemplateV2 {
    const timestamp = new Date().toISOString()

    return {
      version: REPORT_TEMPLATE_V2_VERSION,
      metadata: {
        id: randomUUID(),
        name: `Modelo de ${input.structure.documentType}`,
        description: `Padrão reutilizável aprendido a partir de um único documento do tipo ${input.structure.documentType}.`,
        documentType: input.structure.documentType,
        status: 'draft',
        createdAt: timestamp,
        updatedAt: timestamp,
      },
      structurePattern: structuredClone(input.structure),
      writingPattern: structuredClone(input.writing),
      semanticPattern: structuredClone(input.semantic),
      formattingPattern: structuredClone(input.formatting),
      fields: structuredClone(input.structure.fields),
      activityPatterns: structuredClone(input.structure.activityPatterns),
      requirements: buildV2Requirements(input.structure),
    }
  }
}
