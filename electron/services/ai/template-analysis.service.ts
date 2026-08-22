import type { TemplateAnalysis } from '../../../src/types/template-import'
import type { ExtractedDocument } from '../documents/types'
import { buildTemplateAnalysisPrompt } from './prompts/template-analysis.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'

const REQUIRED_KEYS = [
  'name',
  'description',
  'objective',
  'tone',
  'style',
  'formality',
  'sections',
  'fields',
  'writingRules',
  'recommendedVocabulary',
  'forbiddenExpressions',
] as const

export class TemplateAnalysisError extends Error {
  readonly code = 'INVALID_TEMPLATE_ANALYSIS' as const
  constructor(message: string) {
    super(message)
    this.name = 'TemplateAnalysisError'
  }
}

function stringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

export function isTemplateAnalysis(value: unknown): value is TemplateAnalysis {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  if (!REQUIRED_KEYS.every((key) => Object.hasOwn(value, key))) return false
  const item = value as Record<string, unknown>
  if (!Array.isArray(item.sections) || !Array.isArray(item.fields)) return false

  const sectionsValid = item.sections.every((section: unknown) => {
    if (
      typeof section !== 'object' ||
      section === null ||
      Array.isArray(section)
    )
      return false
    const entry = section as Record<string, unknown>
    return (
      typeof entry.name === 'string' &&
      entry.name.trim() !== '' &&
      typeof entry.description === 'string' &&
      typeof entry.required === 'boolean' &&
      typeof entry.order === 'number' &&
      Number.isInteger(entry.order)
    )
  })
  const orders = item.sections.map(
    (section) => (section as Record<string, unknown>).order as number,
  )
  if (new Set(orders).size !== orders.length) return false

  const fieldsValid = item.fields.every((field: unknown) => {
    if (typeof field !== 'object' || field === null || Array.isArray(field))
      return false
    const entry = field as Record<string, unknown>
    return (
      typeof entry.name === 'string' &&
      entry.name.trim() !== '' &&
      typeof entry.label === 'string' &&
      (entry.type === 'text' ||
        entry.type === 'date' ||
        entry.type === 'number' ||
        entry.type === 'boolean') &&
      typeof entry.required === 'boolean' &&
      typeof entry.description === 'string'
    )
  })

  return (
    typeof item.name === 'string' &&
    item.name.trim() !== '' &&
    typeof item.description === 'string' &&
    typeof item.objective === 'string' &&
    typeof item.tone === 'string' &&
    typeof item.style === 'string' &&
    (item.formality === 'low' ||
      item.formality === 'medium' ||
      item.formality === 'high') &&
    sectionsValid &&
    fieldsValid &&
    stringArray(item.writingRules) &&
    stringArray(item.recommendedVocabulary) &&
    stringArray(item.forbiddenExpressions)
  )
}

const TEMPLATE_ANALYSIS_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    name: { type: 'string' },
    description: { type: 'string' },
    objective: { type: 'string' },
    tone: { type: 'string' },
    style: { type: 'string' },
    formality: { type: 'string', enum: ['low', 'medium', 'high'] },
    sections: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          description: { type: 'string' },
          required: { type: 'boolean' },
          order: { type: 'integer' },
        },
        required: ['name', 'description', 'required', 'order'],
        additionalProperties: false,
      },
    },
    fields: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          type: { type: 'string', enum: ['text', 'date', 'number', 'boolean'] },
          required: { type: 'boolean' },
          description: { type: 'string' },
        },
        required: ['name', 'label', 'type', 'required', 'description'],
        additionalProperties: false,
      },
    },
    writingRules: { type: 'array', items: { type: 'string' } },
    recommendedVocabulary: { type: 'array', items: { type: 'string' } },
    forbiddenExpressions: { type: 'array', items: { type: 'string' } },
  },
  required: [...REQUIRED_KEYS],
  additionalProperties: false,
}

export class TemplateAnalysisService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async analyze(document: ExtractedDocument): Promise<TemplateAnalysis> {
    const response = await this.generator.generateJson(
      buildTemplateAnalysisPrompt(document),
      TEMPLATE_ANALYSIS_SCHEMA,
    )
    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new TemplateAnalysisError(
        'A IA retornou um JSON inválido para o modelo.',
      )
    }
    if (!isTemplateAnalysis(parsed)) {
      throw new TemplateAnalysisError(
        'A análise da IA não corresponde à estrutura esperada.',
      )
    }
    return parsed
  }
}
