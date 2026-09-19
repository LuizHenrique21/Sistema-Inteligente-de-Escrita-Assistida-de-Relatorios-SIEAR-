import { randomUUID } from 'node:crypto'
import type {
  GeneratedReport,
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/types/report-template'
import { buildLearnedReportGenerationPrompt } from './prompts/learned-report-generation.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'
import { ReportGenerationServiceError } from './report-generation.service'

interface GroundedSection {
  name: string
  content: string
  usedEvidence: string[]
}

function evidencePool(information: StructuredActivity): string[] {
  return [
    ...information.facts.map((fact) => fact.evidence),
    ...information.activities.flatMap((activity) => activity.evidence),
  ]
}

function parse(
  response: string,
  information: StructuredActivity,
): GroundedSection[] {
  let value: unknown
  try {
    value = JSON.parse(response)
  } catch {
    throw new ReportGenerationServiceError(
      'A IA retornou JSON inválido para o relatório.',
    )
  }
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    Object.keys(value).length !== 1 ||
    !Object.hasOwn(value, 'sections')
  )
    throw new ReportGenerationServiceError(
      'A resposta não contém somente a estrutura esperada de seções.',
    )
  const sections = (value as Record<string, unknown>).sections
  const pool = evidencePool(information)
  if (
    !Array.isArray(sections) ||
    !sections.every((section: unknown) => {
      if (
        typeof section !== 'object' ||
        section === null ||
        Array.isArray(section)
      )
        return false
      const item = section as Record<string, unknown>
      return (
        Object.keys(item).length === 3 &&
        typeof item.name === 'string' &&
        item.name.trim() !== '' &&
        typeof item.content === 'string' &&
        item.content.trim() !== '' &&
        Array.isArray(item.usedEvidence) &&
        item.usedEvidence.length > 0 &&
        item.usedEvidence.every(
          (evidence) => typeof evidence === 'string' && pool.includes(evidence),
        )
      )
    })
  )
    throw new ReportGenerationServiceError(
      'A resposta contém seções inválidas ou evidências não fornecidas pelo usuário.',
    )
  return sections as GroundedSection[]
}

function validateNumericClaims(
  sections: GroundedSection[],
  information: StructuredActivity,
): void {
  const source = JSON.stringify(information)
  const numbers = sections.flatMap(
    (section) => section.content.match(/\b\d+(?:[.,]\d+)?\b/g) ?? [],
  )
  if (numbers.some((number) => !source.includes(number)))
    throw new ReportGenerationServiceError(
      'A IA incluiu um número que não foi fornecido pelo usuário.',
    )
}

export class LearnedReportGenerationService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async generate(
    information: StructuredActivity,
    plan: ReportGenerationPlan,
    template: ReportTemplate,
  ): Promise<GeneratedReport> {
    const names = plan.sections.map((section) => section.sectionName)
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', enum: names },
              content: { type: 'string', minLength: 1 },
              usedEvidence: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
              },
            },
            required: ['name', 'content', 'usedEvidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['sections'],
      additionalProperties: false,
    }
    const response = await this.generator.generateJson(
      buildLearnedReportGenerationPrompt(information, plan, template),
      schema,
    )
    const sections = parse(response, information)
    const byName = new Map(
      plan.sections.map((section) => [section.sectionName, section]),
    )
    const returnedNames = sections.map((section) => section.name)
    if (
      new Set(returnedNames).size !== returnedNames.length ||
      returnedNames.some((name) => !byName.has(name))
    )
      throw new ReportGenerationServiceError(
        'A IA retornou seções duplicadas ou inexistentes no modelo.',
      )
    const required = template.sections
      .filter((section) => section.required)
      .map((section) => section.name)
    if (required.some((name) => !returnedNames.includes(name)))
      throw new ReportGenerationServiceError(
        'A IA omitiu uma seção obrigatória do modelo.',
      )
    const orders = returnedNames.map(
      (name) => byName.get(name)?.order ?? Number.NaN,
    )
    if (orders.some((order, index) => index > 0 && order <= orders[index - 1]!))
      throw new ReportGenerationServiceError(
        'A IA retornou as seções fora da ordem do modelo.',
      )
    validateNumericClaims(sections, information)
    return {
      id: randomUUID(),
      templateId: template.id,
      templateName: template.name,
      createdAt: new Date().toISOString(),
      sections: sections.map((section) => ({
        id: byName.get(section.name)!.sectionId,
        name: section.name,
        order: byName.get(section.name)!.order,
        content: section.content.trim(),
      })),
    }
  }
}
