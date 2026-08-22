import { randomUUID } from 'node:crypto'
import type {
  GeneratedReport,
  GeneratedReportSection,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/types/report-template'
import type { ReportInformation } from '../../../src/types/siear-api'
import { ReportPromptBuilder } from './prompts/report-generation.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'

interface ModelSection {
  name: string
  content: string
}

export class ReportGenerationServiceError extends Error {
  readonly code = 'INVALID_MODEL_RESPONSE' as const

  constructor(message: string) {
    super(message)
    this.name = 'ReportGenerationServiceError'
  }
}

function parseSections(response: string): ModelSection[] {
  let parsed: unknown
  try {
    parsed = JSON.parse(response)
  } catch {
    throw new ReportGenerationServiceError(
      'A IA retornou um JSON inválido para o relatório.',
    )
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    Array.isArray(parsed) ||
    !Object.hasOwn(parsed, 'sections')
  ) {
    throw new ReportGenerationServiceError(
      'A resposta da IA não contém a estrutura de seções esperada.',
    )
  }

  const sections = (parsed as Record<string, unknown>).sections
  if (!Array.isArray(sections)) {
    throw new ReportGenerationServiceError(
      'A resposta da IA possui uma lista de seções inválida.',
    )
  }

  const valid = sections.every((section: unknown) => {
    if (
      typeof section !== 'object' ||
      section === null ||
      Array.isArray(section)
    ) {
      return false
    }
    const value = section as Record<string, unknown>
    return (
      Object.hasOwn(value, 'name') &&
      Object.hasOwn(value, 'content') &&
      typeof value.name === 'string' &&
      typeof value.content === 'string' &&
      value.content.trim() !== ''
    )
  })

  if (!valid) {
    throw new ReportGenerationServiceError(
      'Uma ou mais seções retornadas pela IA são inválidas.',
    )
  }
  return sections as ModelSection[]
}

function validateSections(
  modelSections: ModelSection[],
  template: ReportTemplate,
): GeneratedReportSection[] {
  const templateSections = [...template.sections].sort(
    (first, second) => first.order - second.order,
  )
  const templateByName = new Map(
    templateSections.map((section) => [section.name, section]),
  )
  const names = modelSections.map((section) => section.name)

  if (new Set(names).size !== names.length) {
    throw new ReportGenerationServiceError('A IA retornou seções duplicadas.')
  }
  if (names.some((name) => !templateByName.has(name))) {
    throw new ReportGenerationServiceError(
      'A IA retornou uma seção que não existe no modelo.',
    )
  }
  if (
    templateSections.some(
      (section) => section.required && !names.includes(section.name),
    )
  ) {
    throw new ReportGenerationServiceError(
      'A IA omitiu uma seção obrigatória do modelo.',
    )
  }

  const orders = names.map(
    (name) => templateByName.get(name)?.order ?? Number.NaN,
  )
  if (orders.some((order, index) => index > 0 && order <= orders[index - 1]!)) {
    throw new ReportGenerationServiceError(
      'A IA retornou as seções fora da ordem definida pelo modelo.',
    )
  }

  return modelSections.map((section) => {
    const templateSection = templateByName.get(section.name)!
    return {
      id: templateSection.id,
      name: templateSection.name,
      order: templateSection.order,
      content: section.content.trim(),
    }
  })
}

export class ReportGenerationService {
  constructor(
    private readonly generator: StructuredTextGenerator,
    private readonly promptBuilder = new ReportPromptBuilder(),
  ) {}

  async generate(
    information: ReportInformation,
    template: ReportTemplate,
  ): Promise<GeneratedReport> {
    const sectionNames = template.sections.map((section) => section.name)
    const schema: Record<string, unknown> = {
      type: 'object',
      properties: {
        sections: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              name: { type: 'string', enum: sectionNames },
              content: { type: 'string', minLength: 1 },
            },
            required: ['name', 'content'],
            additionalProperties: false,
          },
        },
      },
      required: ['sections'],
      additionalProperties: false,
    }
    const response = await this.generator.generateJson(
      this.promptBuilder.build(information, template),
      schema,
    )
    return {
      id: randomUUID(),
      templateId: template.id,
      templateName: template.name,
      sections: validateSections(parseSections(response), template),
      createdAt: new Date().toISOString(),
    }
  }
}
