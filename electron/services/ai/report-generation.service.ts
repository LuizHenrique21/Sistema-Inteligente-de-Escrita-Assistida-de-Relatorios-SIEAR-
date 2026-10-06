import { randomUUID } from 'node:crypto'
import type {
  GeneratedReport,
  PlannedReportSection,
  ReportGenerationPlan,
  ReportGenerationProgress,
  StructuredActivity,
} from '../../../src/types/generated-report'
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import {
  buildReportSectionGenerationPrompt,
  type ReportGenerationEvidence,
} from './prompts/report-generation.prompt'
import type { StructuredTextGenerator } from './report-extraction.service'
import { ReportGenerationServiceError } from './report-generation.error'
import { getLogger } from '../../infrastructure/logging/logger.runtime'

const logger = getLogger('ReportGenerationService')
const MAX_RETRIES = 2
const MAX_RESPONSE_CHARACTERS = 12_000

interface GroundedSection {
  sectionId: string
  name: string
  content: string
  usedEvidenceIds: string[]
}

function evidenceCatalog(
  information: StructuredActivity,
): ReportGenerationEvidence[] {
  return [
    ...information.facts.map((fact) => fact.evidence),
    ...information.activities.flatMap((activity) => activity.evidence),
  ]
    .filter((text, index, values) => text.trim() !== '' && values.indexOf(text) === index)
    .map((text, index) => ({
      id: `evidence-${String(index + 1).padStart(3, '0')}`,
      text,
    }))
}

function schema(section: PlannedReportSection, evidenceIds: string[]): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      sectionId: { type: 'string', enum: [section.sectionId] },
      name: { type: 'string', enum: [section.sectionName] },
      content: { type: 'string', minLength: 1, maxLength: 6_000 },
      usedEvidenceIds: {
        type: 'array',
        minItems: 1,
        maxItems: Math.min(4, evidenceIds.length),
        uniqueItems: true,
        items: { type: 'string', enum: evidenceIds },
      },
    },
    required: ['sectionId', 'name', 'content', 'usedEvidenceIds'],
    additionalProperties: false,
  }
}

function parseSection(
  response: string,
  section: PlannedReportSection,
  evidenceIds: string[],
): GroundedSection {
  let value: unknown
  try {
    value = JSON.parse(response)
  } catch {
    throw new ReportGenerationServiceError('A IA retornou JSON inválido para a seção.')
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ReportGenerationServiceError('A resposta da seção não é um objeto JSON.')
  const item = value as Record<string, unknown>
  if (
    Object.keys(item).length !== 4 ||
    !Object.hasOwn(item, 'sectionId') ||
    !Object.hasOwn(item, 'name') ||
    !Object.hasOwn(item, 'content') ||
    !Object.hasOwn(item, 'usedEvidenceIds') ||
    item.sectionId !== section.sectionId ||
    item.name !== section.sectionName ||
    typeof item.content !== 'string' ||
    item.content.trim() === '' ||
    !Array.isArray(item.usedEvidenceIds) ||
    item.usedEvidenceIds.length === 0 ||
    item.usedEvidenceIds.some(
      (id) => typeof id !== 'string' || !evidenceIds.includes(id),
    ) ||
    new Set(item.usedEvidenceIds).size !== item.usedEvidenceIds.length
  )
    throw new ReportGenerationServiceError(
      'A resposta contém seção inválida ou evidências não fornecidas pelo usuário.',
    )
  return item as unknown as GroundedSection
}

function unsupportedNumbers(
  content: string,
  information: StructuredActivity,
): string[] {
  const sourceNumbers = new Set(
    JSON.stringify(information).match(/\b\d+(?:[.,]\d+)?\b/g) ?? [],
  )
  // A leading "1." or "1)" is presentation, not a numeric claim.
  const withoutListMarkers = content.replace(/(?:^|\n)\s*\d+[.)]\s+/g, '\n')
  return [
    ...new Set(
      (withoutListMarkers.match(/\b\d+(?:[.,]\d+)?\b/g) ?? []).filter(
        (number) => !sourceNumbers.has(number),
      ),
    ),
  ]
}

function validateNumericClaims(
  sections: GroundedSection[],
  information: StructuredActivity,
): void {
  const numbers = sections.flatMap((section) =>
    unsupportedNumbers(section.content, information),
  )
  if (numbers.length > 0)
    throw new ReportGenerationServiceError(
      'A IA incluiu um número que não foi fornecido pelo usuário.',
    )
}

function groundedSectionFallback(
  section: PlannedReportSection,
  information: StructuredActivity,
  evidence: ReportGenerationEvidence[],
): GroundedSection {
  const excerpts = [
    ...information.activities.flatMap((activity) => activity.evidence),
    ...information.facts.map((fact) => fact.evidence),
  ].filter((excerpt, index, values) =>
    excerpt.trim() !== '' && values.indexOf(excerpt) === index,
  )
  const content = excerpts.join(' ').trim().slice(0, 6_000)
  const usedEvidenceIds = evidence
    .filter((item) => excerpts.includes(item.text))
    .slice(0, 4)
    .map((item) => item.id)
  if (!content || !usedEvidenceIds.length)
    throw new ReportGenerationServiceError(
      'Não há evidências suficientes fornecidas pelo usuário para gerar o relatório.',
    )
  return {
    sectionId: section.sectionId,
    name: section.sectionName,
    content,
    usedEvidenceIds,
  }
}

export class ReportGenerationService {
  constructor(private readonly generator: StructuredTextGenerator) {}

  async generate(
    information: StructuredActivity,
    plan: ReportGenerationPlan,
    template: ReportTemplate,
    onProgress?: (progress: ReportGenerationProgress) => void,
  ): Promise<GeneratedReport> {
    const timer = logger.startTimer('Structured report writing', {
      templateId: template.metadata.id,
      plannedSections: plan.sections.length,
    })
    const evidence = evidenceCatalog(information)
    if (!evidence.length)
      throw new ReportGenerationServiceError(
        'Não há evidências suficientes fornecidas pelo usuário para gerar o relatório.',
      )
    const sections: GroundedSection[] = []
    for (const [index, section] of plan.sections.entries()) {
      onProgress?.({
        stage: 'writing',
        message: `Redigindo seção ${index + 1} de ${plan.sections.length}: ${section.sectionName}.`,
        completedSections: index,
        totalSections: plan.sections.length,
        sectionName: section.sectionName,
      })
      sections.push(
        await this.generateSection(information, section, template, evidence, index, plan.sections.length),
      )
      onProgress?.({
        stage: 'writing',
        message: `Seção ${index + 1} de ${plan.sections.length} concluída: ${section.sectionName}.`,
        completedSections: index + 1,
        totalSections: plan.sections.length,
        sectionName: section.sectionName,
      })
    }
    validateNumericClaims(sections, information)
    const report: GeneratedReport = {
      id: randomUUID(),
      templateId: template.metadata.id,
      templateName: template.metadata.name,
      createdAt: new Date().toISOString(),
      sections: sections.map((section, index) => ({
        id: section.sectionId,
        name: section.name,
        order: plan.sections[index]!.order,
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

  private async generateSection(
    information: StructuredActivity,
    section: PlannedReportSection,
    template: ReportTemplate,
    evidence: ReportGenerationEvidence[],
    index: number,
    total: number,
  ): Promise<GroundedSection> {
    const allowedIds = evidence.map((item) => item.id)
    const sectionSchema = schema(section, allowedIds)
    let previous: unknown = null
    let error: unknown = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      logger.info(
        attempt ? 'REPORT_SECTION_RETRY' : 'REPORT_SECTION_STARTED',
        { sectionId: section.sectionId, sectionIndex: index + 1, total, attempt },
      )
      const prompt = attempt
        ? `Corrija somente o JSON anterior. Use o schema e apenas IDs de evidência permitidos. Não invente fatos. Remova qualquer número que não esteja literalmente sustentado pelas evidências; marcadores de lista são permitidos apenas no início da linha. Retorne JSON sem Markdown. SCHEMA: ${JSON.stringify(sectionSchema)} ANTERIOR: ${JSON.stringify(previous)}${previous === null ? ` CONTEXTO: ${buildReportSectionGenerationPrompt(information, section, template, evidence)}` : ''}`
        : buildReportSectionGenerationPrompt(
            information,
            section,
            template,
            evidence,
          )
      const response = await this.generator.generateJson(prompt, sectionSchema)
      if (response.length > MAX_RESPONSE_CHARACTERS) {
        error = new ReportGenerationServiceError('A resposta da seção excedeu o limite permitido.')
        previous = null
      } else {
        try {
          const parsed = parseSection(response, section, allowedIds)
          if (unsupportedNumbers(parsed.content, information).length > 0) {
            if (attempt >= 1) {
              logger.warn('REPORT_SECTION_GROUNDED_FALLBACK', {
                sectionId: section.sectionId,
                sectionIndex: index + 1,
                total,
                reason: 'unsupported-numeric-claims',
              })
              return groundedSectionFallback(section, information, evidence)
            }
            throw new ReportGenerationServiceError(
              'A IA incluiu um número que não foi fornecido pelo usuário.',
            )
          }
          logger.info('REPORT_SECTION_COMPLETED', {
            sectionId: section.sectionId,
            sectionIndex: index + 1,
            total,
            attempt,
          })
          return parsed
        } catch (reason) {
          error = reason
          try {
            previous = JSON.parse(response)
          } catch {
            previous = null
          }
        }
      }
    }
    throw error instanceof Error
      ? error
      : new ReportGenerationServiceError('Não foi possível validar a seção gerada.')
  }
}
