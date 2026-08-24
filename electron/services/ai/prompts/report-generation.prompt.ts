import type {
  SectionRelationship,
  WritingRule,
} from '../../../../src/domain/templates'
import type { ReportTemplate } from '../../../../src/domain/templates/report-template'
import type {
  GeneratedReportSection,
  PlannedReportSection,
  ReportGenerationPlan,
  StructuredActivity,
  StructuredActivityItem,
  StructuredFact,
} from '../../../../src/types/generated-report'
import { compactPromptJson } from './prompt-serialization'

export interface GenerationPromptContext {
  groundingPolicy: ReportGenerationPlan['groundingPolicy']
  currentSection: {
    sectionId: string
    name: string
    order: number
    level: number
    parentSectionId: string | null
    required: boolean
    repeatable: boolean
    purpose: string | null
  }
  applicableRules: {
    writingStyle: PlannedReportSection['writingStyle'] extends infer Style
      ? Style extends null
        ? null
        : Pick<
            NonNullable<PlannedReportSection['writingStyle']>,
            | 'tone'
            | 'formality'
            | 'technicality'
            | 'objectivity'
            | 'grammaticalPerson'
            | 'verbTense'
            | 'voice'
            | 'detailLevel'
            | 'narrativeStyle'
          >
      : never
    sectionRules: WritingRule[]
    globalRules: WritingRule[]
  }
  requiredInformation: {
    factNames: string[]
    expected: NonNullable<
      PlannedReportSection['semantics']
    >['expectedInformation']
    excluded: NonNullable<
      PlannedReportSection['semantics']
    >['excludedInformation']
    order: string[]
  }
  evidence: {
    facts: StructuredFact[]
    activities: Array<StructuredActivityItem & { index: number }>
  }
  relevantRelations: SectionRelationship[]
  previousContext: Array<Pick<GeneratedReportSection, 'id' | 'name' | 'content'>>
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, '')
}

function ruleRelevantToSection(rule: WritingRule, sectionName: string): boolean {
  return (
    rule.evidence.length === 0 ||
    rule.evidence.some(
      (evidence) =>
        evidence.sectionName === null ||
        normalize(evidence.sectionName) === normalize(sectionName),
    )
  )
}

function uniqueRules(rules: WritingRule[]): WritingRule[] {
  return [...new Map(rules.map((rule) => [JSON.stringify(rule), rule])).values()]
}

function relevantPreviousSections(
  previous: GeneratedReportSection[],
  section: PlannedReportSection,
): GenerationPromptContext['previousContext'] {
  const immediate = previous.at(-1)
  const parent = section.parentSectionId
    ? previous.find((item) => item.id === section.parentSectionId)
    : null
  return [parent, immediate]
    .filter((item): item is GeneratedReportSection => item !== null && item !== undefined)
    .filter(
      (item, index, items) =>
        items.findIndex((candidate) => candidate.id === item.id) === index,
    )
    .map((item) => ({ id: item.id, name: item.name, content: item.content }))
}

export function buildGenerationPromptContext(
  information: StructuredActivity,
  plan: ReportGenerationPlan,
  template: ReportTemplate,
  section: PlannedReportSection,
  previousSections: GeneratedReportSection[] = [],
): GenerationPromptContext {
  const style = section.writingStyle
  const sectionRules = style
    ? [
        ...style.introductionPatterns,
        ...style.developmentPatterns,
        ...style.conclusionPatterns,
      ]
    : []
  const globalRules = uniqueRules(
    [
      ...template.writingPattern.vocabulary,
      ...template.writingPattern.terminology,
      ...template.writingPattern.sentencePatterns,
      ...template.writingPattern.paragraphPatterns,
      ...template.writingPattern.narrativePatterns,
      ...template.writingPattern.recommendedPatterns,
      ...template.writingPattern.forbiddenPatterns,
    ].filter((rule) => ruleRelevantToSection(rule, section.sectionName)),
  )
  const expected = section.semantics?.expectedInformation ?? []
  const relevantFactNames = new Set([
    ...section.factNames.map(normalize),
    ...expected.map((item) => normalize(item.name)),
  ])
  return {
    groundingPolicy: plan.groundingPolicy,
    currentSection: {
      sectionId: section.sectionId,
      name: section.sectionName,
      order: section.order,
      level: section.level,
      parentSectionId: section.parentSectionId,
      required: section.required,
      repeatable: section.repeatable,
      purpose: section.purpose,
    },
    applicableRules: {
      writingStyle: style
        ? {
            tone: style.tone,
            formality: style.formality,
            technicality: style.technicality,
            objectivity: style.objectivity,
            grammaticalPerson: style.grammaticalPerson,
            verbTense: style.verbTense,
            voice: style.voice,
            detailLevel: style.detailLevel,
            narrativeStyle: style.narrativeStyle,
          }
        : null,
      sectionRules,
      globalRules,
    },
    requiredInformation: {
      factNames: section.factNames,
      expected,
      excluded: section.semantics?.excludedInformation ?? [],
      order: section.semantics?.informationOrder ?? [],
    },
    evidence: {
      facts: information.facts.filter((fact) => {
        const names = [normalize(fact.name), normalize(fact.label)]
        return names.some((name) =>
          [...relevantFactNames].some(
            (required) => name.includes(required) || required.includes(name),
          ),
        )
      }),
      activities: section.activityIndexes
        .map((index) => information.activities[index])
        .filter(
          (activity): activity is StructuredActivityItem =>
            activity !== undefined,
        )
        .map((activity, index) => ({
          ...activity,
          index: section.activityIndexes[index] ?? index,
        })),
    },
    relevantRelations: [
      ...(section.semantics?.relationships ?? []),
      ...plan.templateContext.crossSectionRelations.filter(
        (relation) =>
          normalize(relation.targetSection) === normalize(section.sectionName),
      ),
    ],
    previousContext: relevantPreviousSections(previousSections, section),
  }
}

export function buildReportGenerationPrompt(
  context: GenerationPromptContext,
): string {
  return `Voce e o redator estruturado de relatorios do SIEAR.

O contexto ja determinou a secao atual. Voce deve somente preencher o conteudo desta secao, mantendo seu identificador e nome.
StructuredActivity é a única fonte de fatos. O template define exclusivamente COMO escrever e nunca é fonte do que aconteceu.
E proibido inventar ou inferir datas, equipamentos, resultados, problemas, procedimentos, responsaveis, numeros ou qualquer outro fato sem evidencia.
Respeite pessoa, tempo verbal, voz, formalidade, regras, vocabulario, terminologia, padrao narrativo, informacoes esperadas e excluidas e relacoes semanticas aplicaveis.
Nao resolva incertezas sem evidencia. Nao crie, remova, renomeie, reordene ou reorganize secoes.
Cada afirmacao factual deve estar apoiada por usedEvidence copiada literalmente das evidencias do contexto.
Retorne exclusivamente JSON valido, sem Markdown.

Formato: {"sections":[{"sectionId":"identificador exato da secao atual","name":"nome exato","content":"texto","usedEvidence":["trecho literal"]}]}

GENERATION PROMPT CONTEXT:
${compactPromptJson(context)}`
}
