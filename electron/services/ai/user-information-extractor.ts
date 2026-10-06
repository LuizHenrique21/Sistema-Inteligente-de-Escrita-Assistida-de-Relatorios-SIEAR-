import type {
  StructuredActivity,
  StructuredActivityItem,
  StructuredFact,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import { buildUserInformationExtractionPrompt } from './prompts/user-information-extraction.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('UserInformationExtractor')

const EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: 'object',
  properties: {
    facts: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          label: { type: 'string' },
          value: { type: 'string' },
          evidence: { type: 'string' },
        },
        required: ['name', 'label', 'value', 'evidence'],
        additionalProperties: false,
      },
    },
    activities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          description: { type: 'string' },
          procedures: { type: 'array', items: { type: 'string' } },
          result: { type: ['string', 'null'] },
          problems: { type: 'array', items: { type: 'string' } },
          evidence: { type: 'array', items: { type: 'string' } },
        },
        required: [
          'description',
          'procedures',
          'result',
          'problems',
          'evidence',
        ],
        additionalProperties: false,
      },
    },
  },
  required: ['facts', 'activities'],
  additionalProperties: false,
}

export class UserInformationExtractionError extends Error {
  readonly code = 'INVALID_MODEL_RESPONSE' as const
  constructor(message: string) {
    super(message)
    this.name = 'UserInformationExtractionError'
  }
}

function exact(value: Record<string, unknown>, keys: string[]): boolean {
  return (
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  )
}
function nonEmpty(value: unknown): value is string {
  return typeof value === 'string' && value.trim() !== ''
}
function normalizeEvidence(value: string): string {
  return value
    .normalize('NFKC')
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u201C\u201D]/gu, '"')
    .replace(/[\s\u00a0]+/gu, ' ')
    .trim()
    .toLocaleLowerCase('pt-BR')
}

function evidenceExists(evidence: string, source: string): boolean {
  return normalizeEvidence(source).includes(normalizeEvidence(evidence))
}

function validFact(value: unknown, source: string): value is StructuredFact {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, ['name', 'label', 'value', 'evidence']) &&
    nonEmpty(item.name) &&
    nonEmpty(item.label) &&
    nonEmpty(item.value) &&
    nonEmpty(item.evidence) &&
    evidenceExists(item.evidence, source)
  )
}

function validActivity(
  value: unknown,
  source: string,
): value is StructuredActivityItem {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    exact(item, [
      'description',
      'procedures',
      'result',
      'problems',
      'evidence',
    ]) &&
    nonEmpty(item.description) &&
    Array.isArray(item.procedures) &&
    item.procedures.every(nonEmpty) &&
    (item.result === null || nonEmpty(item.result)) &&
    Array.isArray(item.problems) &&
    item.problems.every(nonEmpty) &&
    Array.isArray(item.evidence) &&
    item.evidence.length > 0 &&
    item.evidence.every(
      (entry) => nonEmpty(entry) && evidenceExists(entry, source),
    )
  )
}

export class UserInformationExtractor {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async extract(
    text: string,
    template: ReportTemplate,
  ): Promise<StructuredActivity> {
    const prompt = buildUserInformationExtractionPrompt(text, template)
    let response = await this.generator.generateJson(prompt, EXTRACTION_SCHEMA)
    let validation = validateResponse(response, text)

    if (!validation.valid) {
      logger.warn('User information extraction needs repair', {
        reasons: validation.reasons,
        responseLength: response.length,
      })
      response = await this.generator.generateJson(
        buildRepairPrompt(prompt, response, validation.reasons),
        EXTRACTION_SCHEMA,
      )
      validation = validateResponse(response, text)
    }

    if (!validation.valid) {
      logger.warn('User information extraction repair failed', {
        reasons: validation.reasons,
        responseLength: response.length,
      })
      const fallback = groundedFallback(text)
      if (fallback) {
        logger.warn('User information extraction used grounded fallback', {
          facts: fallback.facts.length,
          activities: fallback.activities.length,
        })
        return fallback
      }
      throw new UserInformationExtractionError(
        'A extração não pôde ser validada. Revise o relato e tente novamente.',
      )
    }
    return validation.value
  }
}

type ValidationResult =
  | { valid: true; value: StructuredActivity }
  | { valid: false; reasons: string[] }

function validateResponse(response: string, source: string): ValidationResult {
  let parsed: unknown
  try {
    parsed = JSON.parse(response)
  } catch {
    return { valid: false, reasons: ['invalid-json'] }
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed))
    return { valid: false, reasons: ['root-not-object'] }

  const item = parsed as Record<string, unknown>
  const reasons: string[] = []
  if (!exact(item, ['facts', 'activities'])) reasons.push('invalid-root-keys')
  if (!Array.isArray(item.facts)) reasons.push('facts-not-array')
  else if (!item.facts.every((fact) => validFact(fact, source)))
    reasons.push('invalid-fact-or-evidence')
  if (!Array.isArray(item.activities)) reasons.push('activities-not-array')
  else if (
    !item.activities.every((activity) => validActivity(activity, source))
  )
    reasons.push('invalid-activity-or-evidence')
  if (reasons.length > 0) return { valid: false, reasons }

  return {
    valid: true,
    value: {
      facts: item.facts as StructuredFact[],
      activities: item.activities as StructuredActivityItem[],
    },
  }
}

function buildRepairPrompt(
  originalPrompt: string,
  previousResponse: string,
  reasons: string[],
): string {
  return `${originalPrompt}

CORREÇÃO OBRIGATÓRIA:
A resposta anterior foi rejeitada por: ${reasons.join(', ')}.
Retorne novamente SOMENTE o JSON do formato obrigatório. Não acrescente chaves.
Cada evidence deve ser um trecho literal do TEXTO DO USUÁRIO; preserve palavras, números e fatos sem paráfrase.
Se não puder sustentar um fato ou atividade por trecho literal, remova-o ou use os arrays vazios e null permitidos.

RESPOSTA ANTERIOR A CORRIGIR:
${previousResponse}`
}

/**
 * Last-resort parser for an invalid model response. It never fabricates facts:
 * labels and values are taken from explicit `Rótulo: valor` lines and every
 * activity evidence item is a literal sentence from the original input.
 */
function groundedFallback(source: string): StructuredActivity | null {
  const lines = source
    .split(/\r?\n/gu)
    .map((line) => line.trim())
    .filter(Boolean)
  if (lines.length === 0) return null

  const facts: StructuredFact[] = []
  const narrative: string[] = []
  for (const line of lines) {
    const match = /^([^:]{2,80}):\s*(.+)$/u.exec(line)
    if (!match) {
      narrative.push(line)
      continue
    }
    const label = match[1]!.trim()
    const value = match[2]!.trim()
    if (!value) continue
    facts.push({
      name: fieldName(label),
      label,
      value,
      evidence: line,
    })
  }

  const narrativeSource = narrative.join(' ').trim() || source.trim()
  const sentences = narrativeSource
    .split(/(?<=[.!?])\s+/u)
    .map((sentence) => sentence.trim())
    .filter(Boolean)
  if (sentences.length === 0) return null

  const result = [...sentences]
    .reverse()
    .find((sentence) =>
      /\b(com isso|foi possível|resultado|conclu)/iu.test(sentence),
    )

  return {
    facts,
    activities: [
      {
        description: sentences[0]!,
        procedures: sentences.slice(0, 12),
        result: result ?? null,
        problems: [],
        evidence: sentences.slice(0, 12),
      },
    ],
  }
}

function fieldName(label: string): string {
  const normalized = label
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/gu, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/gu, '_')
    .replace(/^_+|_+$/gu, '')
  return normalized || 'informacao'
}
