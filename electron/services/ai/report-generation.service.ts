import { randomUUID } from 'node:crypto'
import type {
  GeneratedReport,
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { buildReportGenerationPrompt } from './prompts/report-generation.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'
import { ReportGenerationServiceError } from './report-generation.error'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('ReportGenerationService')

interface GroundedSection {
  sectionId: string
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
        Object.keys(item).length === 4 &&
        typeof item.sectionId === 'string' &&
        item.sectionId.trim() !== '' &&
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

export class ReportGenerationService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async generate(
    information: StructuredActivity,
    plan: ReportGenerationPlan,
    template: ReportTemplate,
  ): Promise<GeneratedReport> {
    const timer = logger.startTimer('Structured report writing', {
      templateId: template.metadata.id,
      plannedSections: plan.sections.length,
    })
    const sectionIds = plan.sections.map((section) => section.sectionId)
    const names = plan.sections.map((section) => section.sectionName)
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              sectionId: { type: 'string', enum: sectionIds },
              name: { type: 'string', enum: names },
              content: { type: 'string', minLength: 1 },
              usedEvidence: {
                type: 'array',
                minItems: 1,
                items: { type: 'string' },
              },
            },
            required: ['sectionId', 'name', 'content', 'usedEvidence'],
            additionalProperties: false,
          },
        },
      },
      required: ['sections'],
      additionalProperties: false,
    }
    const response = await this.generator.generateJson(
      buildReportGenerationPrompt(information, plan, template),
      schema,
    )
    const sections = parse(response, information)
    const byId = new Map(
      plan.sections.map((section) => [section.sectionId, section]),
    )
    const returnedIds = sections.map((section) => section.sectionId)
    if (
      new Set(returnedIds).size !== returnedIds.length ||
      returnedIds.some((id) => !byId.has(id)) ||
      sections.some(
        (section) => byId.get(section.sectionId)?.sectionName !== section.name,
      )
    )
      throw new ReportGenerationServiceError(
        'A IA retornou seções duplicadas ou inexistentes no modelo.',
      )
    if (sectionIds.some((id) => !returnedIds.includes(id)))
      throw new ReportGenerationServiceError(
        'A IA omitiu uma seção definida pelo plano de geração.',
      )
    const expectedOrder = plan.sections.map((section) => section.sectionId)
    const returnedPositions = returnedIds.map((id) => expectedOrder.indexOf(id))
    if (
      returnedPositions.some(
        (position, index) =>
          index > 0 && position <= returnedPositions[index - 1]!,
      )
    )
      throw new ReportGenerationServiceError(
        'A IA retornou as seções fora da ordem do modelo.',
      )
    validateNumericClaims(sections, information)
    const report: GeneratedReport = {
      id: randomUUID(),
      templateId: template.metadata.id,
      templateName: template.metadata.name,
      createdAt: new Date().toISOString(),
      sections: sections.map((section) => ({
        id: section.sectionId,
        name: section.name,
        order: byId.get(section.sectionId)!.order,
        content: section.content.trim(),
        elements: [
          { type: 'paragraph' as const, content: section.content.trim() },
        ],
      })),
    }
    timer.end('Structured report writing completed', {
      reportId: report.id,
      sections: report.sections.length,
    })
    return report
  }
}
