import type { ReportInformation } from '../../../src/types/siear-api'
import { buildReportExtractionPrompt } from './prompts/report-extraction.prompt'

const REPORT_FIELDS = [
  'equipment',
  'activities',
  'result',
  'problems',
  'duration',
  'observations',
] as const

export interface StructuredTextGenerator {
  generateJson(
    prompt: string,
    schema?: Record<string, unknown>,
  ): Promise<string>
}

export class ReportExtractionServiceError extends Error {
  readonly code = 'INVALID_MODEL_RESPONSE' as const

  constructor(message: string) {
    super(message)
    this.name = 'ReportExtractionServiceError'
  }
}

function isNullableString(value: unknown): value is string | null {
  return value === null || typeof value === 'string'
}

export function isReportInformation(
  value: unknown,
): value is ReportInformation {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return false
  }

  if (!REPORT_FIELDS.every((field) => Object.hasOwn(value, field))) {
    return false
  }

  const report = value as Record<string, unknown>
  return (
    isNullableString(report.equipment) &&
    Array.isArray(report.activities) &&
    report.activities.every((activity) => typeof activity === 'string') &&
    isNullableString(report.result) &&
    isNullableString(report.problems) &&
    isNullableString(report.duration) &&
    isNullableString(report.observations)
  )
}

export class ReportExtractionService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async extract(text: string): Promise<ReportInformation> {
    const response = await this.generator.generateJson(
      buildReportExtractionPrompt(text),
    )

    let parsed: unknown
    try {
      parsed = JSON.parse(response)
    } catch {
      throw new ReportExtractionServiceError(
        'A IA retornou um JSON inválido para a extração.',
      )
    }

    if (!isReportInformation(parsed)) {
      throw new ReportExtractionServiceError(
        'A resposta da IA não corresponde à estrutura esperada.',
      )
    }

    return parsed
  }
}
