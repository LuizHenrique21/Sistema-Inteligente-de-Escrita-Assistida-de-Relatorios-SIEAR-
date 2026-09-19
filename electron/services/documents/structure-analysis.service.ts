import type { StructuredTextGenerator } from '../ai/report-extraction.service'
import {
  buildStructureAnalysisPrompt,
  buildStructureSemanticSummary,
} from '../ai/prompts/structure-analysis.prompt'
import type { DocumentRepresentation, ExtractedSection } from './types'
import type {
  ActivityPattern,
  FieldEvidence,
  RecurringElement,
  SectionPattern,
  StructureField,
  StructureFieldType,
  StructurePattern,
} from '../../../src/domain/templates/structure-pattern'

const FIELD_NAMES = new Map<string, string>([
  ['nome', 'nome'],
  ['data', 'data'],
  ['responsavel', 'responsável'],
  ['codigo', 'código'],
  ['equipamento', 'equipamento'],
  ['numero de atividade', 'número de atividade'],
  ['atividade', 'atividade'],
  ['sprint', 'sprint'],
  ['projeto', 'projeto'],
  ['setor', 'setor'],
  ['cliente', 'cliente'],
])

const SEMANTIC_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    documentType: { type: ['string', 'null'] },
    sectionPurposes: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          purpose: { type: ['string', 'null'] },
        },
        required: ['name', 'purpose'],
        additionalProperties: false,
      },
    },
  },
  required: ['documentType', 'sectionPurposes'],
  additionalProperties: false,
}

interface SemanticAnalysis {
  documentType: string | null
  sectionPurposes: Array<{ name: string; purpose: string | null }>
}

export class StructureAnalysisError extends Error {
  readonly code = 'INVALID_STRUCTURE_ANALYSIS' as const

  constructor(message: string) {
    super(message)
    this.name = 'StructureAnalysisError'
  }
}

function normalize(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/^\s*\d+(?:\.\d+)*[.)-]?\s*/, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function canonicalActivity(value: string): string {
  return normalize(value)
    .replace(/\b(?:atividade|activity)\s+(?:n\s*)?\d+\b/g, 'atividade {n}')
    .replace(/\b(?:atividade|activity)\s+[ivxlcdm]+\b/g, 'atividade {n}')
}

function purposeOf(name: string): string | null {
  const value = normalize(name)
  const purposes: Array<[RegExp, string]> = [
    [
      /objetivo|finalidade/,
      'Apresentar o objetivo do documento ou da atividade.',
    ],
    [/introducao|contexto/, 'Contextualizar o documento.'],
    [/descri(cao|tion)/, 'Descrever a atividade ou o objeto analisado.'],
    [/justificativa|motivacao/, 'Registrar a justificativa da atividade.'],
    [
      /atividades?|procedimentos?/,
      'Registrar atividades ou procedimentos executados.',
    ],
    [/resultados?/, 'Registrar os resultados observados.'],
    [/conclusao|consideracoes finais/, 'Consolidar a conclusão do documento.'],
    [/observacoes?/, 'Registrar observações complementares.'],
  ]
  return purposes.find(([pattern]) => pattern.test(value))?.[1] ?? null
}

function fieldType(value: string): StructureFieldType {
  if (/^\d{1,2}[/-]\d{1,2}[/-]\d{2,4}$/.test(value.trim())) return 'date'
  if (/^-?[\d.,]+$/.test(value.trim())) return 'number'
  if (/^(?:sim|não|nao|true|false)$/i.test(value.trim())) return 'boolean'
  return 'text'
}

function fieldKey(label: string): string | null {
  const normalized = normalize(label)
  return FIELD_NAMES.has(normalized) ? normalized : null
}

function extractFields(document: DocumentRepresentation): StructureField[] {
  const collected = new Map<string, StructureField>()
  const add = (label: string, value: string, evidence: FieldEvidence): void => {
    const key = fieldKey(label)
    if (!key || value.trim() === '') return
    const existing = collected.get(key)
    if (existing) {
      existing.evidence.push(evidence)
      existing.required = existing.evidence.length > 1
      return
    }
    collected.set(key, {
      name: key.replace(/\s+(.)/g, (_, letter: string) => letter.toUpperCase()),
      label: FIELD_NAMES.get(key) ?? label.trim(),
      type: fieldType(value),
      required: false,
      evidence: [evidence],
    })
  }

  for (const paragraph of document.paragraphs) {
    const match = paragraph.text.match(/^\s*([^:]{2,50})\s*:\s*(.+)$/)
    if (match) {
      add(match[1] ?? '', match[2] ?? '', {
        source: 'paragraph',
        elementId: paragraph.id,
        excerpt: paragraph.text,
        reason:
          'Rótulo reconhecido seguido por dois-pontos e um valor explícito.',
      })
    }
  }
  for (const table of document.tables) {
    const header = table.rows[0] ?? []
    for (const [column, label] of header.entries()) {
      const values = table.rows
        .slice(Math.max(table.headerRows, 1))
        .map((row) => row[column] ?? '')
        .filter(Boolean)
      if (values.length) {
        add(label, values[0] ?? '', {
          source: 'table',
          elementId: table.id,
          excerpt: `${label}: ${values[0]}`,
          reason:
            'Cabeçalho de coluna reconhecido com valor em linha de dados.',
        })
      }
    }
  }
  return [...collected.values()]
}

function buildSectionPatterns(sections: ExtractedSection[]): {
  flat: SectionPattern[]
  hierarchy: SectionPattern[]
} {
  const occurrenceCount = new Map<string, number>()
  for (const section of sections) {
    const key = canonicalActivity(section.title)
    occurrenceCount.set(key, (occurrenceCount.get(key) ?? 0) + 1)
  }
  const byId = new Map<string, SectionPattern>()
  const flat = sections.map((section) => {
    const count = occurrenceCount.get(canonicalActivity(section.title)) ?? 1
    const pattern: SectionPattern = {
      name: section.title,
      level: section.level,
      order: section.order,
      purpose: purposeOf(section.title),
      required: true,
      repeatable:
        count > 1 || /\batividade\s*(?:\d+|[ivxlcdm]+)\b/i.test(section.title),
      children: [],
    }
    byId.set(section.id, pattern)
    return pattern
  })
  const hierarchy: SectionPattern[] = []
  sections.forEach((section, index) => {
    const pattern = flat[index]
    if (!pattern) return
    const parent = section.parentSectionId
      ? byId.get(section.parentSectionId)
      : undefined
    if (parent) parent.children.push(pattern)
    else hierarchy.push(pattern)
  })
  return { flat, hierarchy }
}

function activityPatterns(
  document: DocumentRepresentation,
  fields: StructureField[],
): ActivityPattern[] {
  const groups = new Map<string, ExtractedSection[]>()
  for (const section of document.sections) {
    const key = canonicalActivity(section.title)
    if (!key.includes('atividade {n}')) continue
    const values = groups.get(key) ?? []
    values.push(section)
    groups.set(key, values)
  }
  return [...groups.entries()]
    .filter(([, roots]) => roots.length > 1)
    .map(([namePattern, roots]) => {
      const childSequences = roots.map((root) =>
        document.sections
          .filter((section) => section.parentSectionId === root.id)
          .sort((a, b) => a.order - b.order)
          .map((section) => normalize(section.title)),
      )
      const common =
        childSequences[0]?.filter((name, index) =>
          childSequences.every((sequence) => sequence[index] === name),
        ) ?? []
      const descendantsOf = (rootId: string): Set<string> => {
        const ids = new Set([rootId])
        let changed = true
        while (changed) {
          changed = false
          for (const section of document.sections) {
            if (
              section.parentSectionId &&
              ids.has(section.parentSectionId) &&
              !ids.has(section.id)
            ) {
              ids.add(section.id)
              changed = true
            }
          }
        }
        return ids
      }
      const activityFields = fields.filter((field) =>
        roots.every((root) => {
          const sectionIds = descendantsOf(root.id)
          return field.evidence.some((evidence) => {
            const sectionId = document.paragraphs.find(
              (paragraph) => paragraph.id === evidence.elementId,
            )?.sectionId
            return (
              sectionId !== null &&
              sectionId !== undefined &&
              sectionIds.has(sectionId)
            )
          })
        }),
      )
      return {
        namePattern,
        sections: common,
        order: Math.min(...roots.map((root) => root.order)),
        repeatable: true,
        fields: activityFields,
      }
    })
}

function recurringElements(
  document: DocumentRepresentation,
  sections: SectionPattern[],
  fields: StructureField[],
): RecurringElement[] {
  const result: RecurringElement[] = []
  const sectionGroups = new Map<string, SectionPattern[]>()
  for (const section of sections) {
    const key = canonicalActivity(section.name)
    const values = sectionGroups.get(key) ?? []
    values.push(section)
    sectionGroups.set(key, values)
  }
  for (const [name, values] of sectionGroups)
    if (values.length > 1)
      result.push({
        type: 'section',
        name,
        occurrences: values.length,
        evidence: values.map((value) => value.name),
      })
  if (document.lists.length > 1)
    result.push({
      type: 'list',
      name: 'lista',
      occurrences: document.lists.length,
      evidence: document.lists.map((list) => list.id),
    })
  if (document.tables.length > 1)
    result.push({
      type: 'table',
      name: 'tabela',
      occurrences: document.tables.length,
      evidence: document.tables.map((table) => table.id),
    })
  if (document.figures.length > 1)
    result.push({
      type: 'figure',
      name: 'figura',
      occurrences: document.figures.length,
      evidence: document.figures.map((figure) => figure.caption ?? figure.id),
    })
  for (const field of fields)
    if (field.evidence.length > 1)
      result.push({
        type: 'field',
        name: field.label,
        occurrences: field.evidence.length,
        evidence: field.evidence.map((evidence) => evidence.excerpt),
      })
  return result
}

function validSemantic(
  value: unknown,
  sectionNames: Set<string>,
): value is SemanticAnalysis {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  if (
    Object.keys(item).length !== 2 ||
    !Object.hasOwn(item, 'documentType') ||
    !Object.hasOwn(item, 'sectionPurposes')
  )
    return false
  if (
    !(
      (typeof item.documentType === 'string' &&
        item.documentType.trim() !== '') ||
      item.documentType === null
    ) ||
    !Array.isArray(item.sectionPurposes)
  )
    return false
  return item.sectionPurposes.every((entry) => {
    if (typeof entry !== 'object' || entry === null || Array.isArray(entry))
      return false
    const purpose = entry as Record<string, unknown>
    return (
      Object.keys(purpose).length === 2 &&
      Object.hasOwn(purpose, 'name') &&
      Object.hasOwn(purpose, 'purpose') &&
      typeof purpose.name === 'string' &&
      purpose.name.trim() !== '' &&
      sectionNames.has(purpose.name) &&
      (typeof purpose.purpose === 'string' || purpose.purpose === null)
    )
  })
}

export class StructureAnalysisService {
  constructor(private readonly semanticGenerator?: StructuredTextGenerator) {}

  async analyze(document: DocumentRepresentation): Promise<StructurePattern> {
    const fields = extractFields(document)
    const { flat: sections, hierarchy } = buildSectionPatterns(
      document.sections,
    )
    const activities = activityPatterns(document, fields)
    const title =
      document.metadata.title ??
      document.headings.find(
        (heading) =>
          heading.level ===
          Math.min(...document.headings.map((item) => item.level)),
      )?.title ??
      null
    let documentType = title ?? 'documento não classificado'
    const unresolved =
      !title || sections.some((section) => section.purpose === null)

    if (unresolved && this.semanticGenerator) {
      const summary = buildStructureSemanticSummary(
        document,
        fields.flatMap((field) =>
          field.evidence.map((evidence) => ({
            label: field.label,
            excerpt: evidence.excerpt,
          })),
        ),
      )
      const response = await this.semanticGenerator.generateJson(
        buildStructureAnalysisPrompt(summary),
        SEMANTIC_SCHEMA,
      )
      let semantic: unknown
      try {
        semantic = JSON.parse(response)
      } catch {
        throw new StructureAnalysisError(
          'O Ollama retornou JSON inválido para a análise estrutural.',
        )
      }
      const sectionNames = new Set(sections.map((section) => section.name))
      if (!validSemantic(semantic, sectionNames))
        throw new StructureAnalysisError(
          'A resposta semântica não corresponde ao contrato estrutural ou menciona seções inexistentes.',
        )
      if (semantic.documentType) documentType = semantic.documentType
      for (const section of sections) {
        if (section.purpose !== null) continue
        section.purpose =
          semantic.sectionPurposes.find((item) => item.name === section.name)
            ?.purpose ?? null
      }
    }

    const recurring = recurringElements(document, sections, fields)
    const requiredElements = sections
      .filter((section) => section.required)
      .map((section) => section.name)
    requiredElements.push(
      ...document.lists.map(
        (list, index) => `Lista ${index + 1} (${list.items.length} itens)`,
      ),
      ...document.tables.map(
        (table, index) =>
          `Tabela ${index + 1} (${table.rowCount}x${table.columnCount})`,
      ),
      ...document.figures.map(
        (figure) =>
          `Figura ${figure.index}: ${figure.caption ?? figure.fileName ?? 'sem legenda'}`,
      ),
      ...document.headers.map(
        (header) => `Cabeçalho ${header.variant}: ${header.text}`,
      ),
      ...document.footers.map(
        (footer) => `Rodapé ${footer.variant}: ${footer.text}`,
      ),
    )
    const optionalElements = sections
      .filter((section) => !section.required)
      .map((section) => section.name)
    return {
      documentType,
      mainTitle: title,
      hierarchy,
      sections,
      activityPatterns: activities,
      fields,
      recurringElements: recurring,
      optionalElements,
      requiredElements,
    }
  }
}
