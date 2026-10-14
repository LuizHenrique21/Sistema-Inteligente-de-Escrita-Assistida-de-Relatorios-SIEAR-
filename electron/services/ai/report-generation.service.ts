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
import { reviewReportGrounding } from './report-grounding-review'

const logger = getLogger('ReportGenerationService')
const MAX_RETRIES = 2
const MAX_RESPONSE_CHARACTERS = 12_000
const MINIMUM_REPORT_WORDS = 350

interface GroundedSection {
  fallback?: boolean
  sectionId: string
  name: string
  content: string
  usedEvidenceIds: string[]
}

function evidenceCatalog(
  information: StructuredActivity,
): ReportGenerationEvidence[] {
  return [
    ...(information.sourceText
      ? information.sourceText.split(/\r?\n+/).filter(Boolean)
      : []),
    ...information.facts.map((fact) => fact.evidence),
    ...information.activities.flatMap((activity) => activity.evidence),
  ]
    .filter(
      (text, index, values) =>
        text.trim() !== '' && values.indexOf(text) === index,
    )
    .map((text, index) => ({
      id: `evidence-${String(index + 1).padStart(3, '0')}`,
      text,
    }))
}

function schema(
  section: PlannedReportSection,
  evidenceIds: string[],
): Record<string, unknown> {
  return {
    type: 'object',
    properties: {
      sectionId: { type: 'string', enum: [section.sectionId] },
      name: { type: 'string', enum: [section.sectionName] },
      content: { type: 'string', minLength: 1, maxLength: 6_000 },
      usedEvidenceIds: {
        type: 'array',
        minItems: 1,
        maxItems: evidenceIds.length,
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
    throw new ReportGenerationServiceError(
      'A IA retornou JSON inválido para a seção.',
    )
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    throw new ReportGenerationServiceError(
      'A resposta da seção não é um objeto JSON.',
    )
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
    evidenceCatalog(information)
      .map((item) => item.text)
      .join(' ')
      .match(/\b\d+(?:[.,]\d+)?\b/g) ?? [],
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

function wordCount(value: string): number {
  return value.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0
}

function minimumDetailedWordCount(
  information: StructuredActivity,
  sections: number,
): number {
  const source = [
    ...information.facts.map((fact) => fact.evidence),
    ...information.activities.flatMap((activity) => activity.evidence),
  ]
    .filter(
      (item, index, values) =>
        item.trim() !== '' && values.indexOf(item) === index,
    )
    .join(' ')
  const sourceWords = wordCount(information.sourceText ?? source)
  if (!information.sourceText && sourceWords < 80) return 0
  return Math.ceil(
    Math.max(MINIMUM_REPORT_WORDS, Math.ceil(sourceWords * 0.9)) /
      Math.max(1, sections),
  )
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
  ].filter(
    (excerpt, index, values) =>
      excerpt.trim() !== '' && values.indexOf(excerpt) === index,
  )
  const content = (information.sourceText ?? excerpts.join('\n\n'))
    .trim()
    .slice(0, 6_000)
  const usedEvidenceIds = evidence
    .filter((item) => excerpts.includes(item.text))
    .slice(0, 4)
    .map((item) => item.id)
  if (!content || !usedEvidenceIds.length)
    throw new ReportGenerationServiceError(
      'Não há evidências suficientes fornecidas pelo usuário para gerar o relatório.',
    )
  return {
    fallback: true,
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
    let sections: GroundedSection[] = []
    for (const [index, section] of plan.sections.entries()) {
      onProgress?.({
        stage: 'writing',
        message: `Redigindo seção ${index + 1} de ${plan.sections.length}: ${section.sectionName}.`,
        completedSections: index,
        totalSections: plan.sections.length,
        sectionName: section.sectionName,
      })
      sections.push(
        await this.generateSection(
          information,
          section,
          template,
          evidence,
          index,
          plan.sections.length,
        ),
      )
      onProgress?.({
        stage: 'writing',
        message: `Seção ${index + 1} de ${plan.sections.length} concluída: ${section.sectionName}.`,
        completedSections: index + 1,
        totalSections: plan.sections.length,
        sectionName: section.sectionName,
      })
    }
    if (information.sourceText) {
      onProgress?.({
        stage: 'finalizing',
        message: 'Revisando a fidelidade do texto ao relato...',
        completedSections: sections.length,
        totalSections: sections.length,
        sectionName: null,
      })
      const review = await reviewReportGrounding(
        this.generator,
        sections,
        information.sourceText,
      )
      sections = review.sections.map((section, index) =>
        section.content.trim()
          ? section
          : groundedSectionFallback(
              plan.sections[index]!,
              information,
              evidence,
            ),
      )
      logger.info('Report grounding review completed', {
        removedSentences: review.removedSentences,
        sections: sections.length,
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
        sourceSectionName: plan.sections[index]!.structure.name,
        order: plan.sections[index]!.order,
        content: section.content.trim(),
        elements: section.content
          .trim()
          .split(/\r?\n+/)
          .map((content) => content.trim())
          .filter(Boolean)
          .map((content) => ({ type: 'paragraph' as const, content })),
      })),
    }
    const notices: string[] = []
    if (sections.some((section) => section.fallback))
      notices.push(
        'Parte do relatório foi preservada como transcrição do relato porque a redação da IA não pôde ser validada. Revise antes de exportar.',
      )
    if (
      wordCount(report.sections.map((section) => section.content).join(' ')) <
      MINIMUM_REPORT_WORDS
    )
      notices.push(
        'O texto ficou abaixo da meta de uma lauda (350 palavras). Acrescente detalhes da execução para ampliar o conteúdo com fidelidade.',
      )
    if (notices.length) report.notices = notices
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
    const minimumContentWords = minimumDetailedWordCount(information, total)
    const basePrompt = buildReportSectionGenerationPrompt(
      information,
      section,
      template,
      evidence,
      minimumContentWords,
    )
    let previous: unknown = null
    let error: unknown = null
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      logger.info(attempt ? 'REPORT_SECTION_RETRY' : 'REPORT_SECTION_STARTED', {
        sectionId: section.sectionId,
        sectionIndex: index + 1,
        total,
        attempt,
      })
      const prompt = attempt
        ? `${basePrompt}\nCorrija somente o JSON anterior. Motivo: ${error instanceof Error ? error.message : 'Contrato inválido'}. Remova qualquer número sem evidência. Preserve os detalhes informados. SCHEMA: ${JSON.stringify(sectionSchema)} ANTERIOR (resposta não confiável): ${JSON.stringify(previous)}`
        : basePrompt
      const response = await this.generator.generateJson(
        prompt,
        sectionSchema,
        { think: false, temperature: 0.15, numPredict: 2400 },
      )
      if (response.length > MAX_RESPONSE_CHARACTERS) {
        error = new ReportGenerationServiceError(
          'A resposta da seção excedeu o limite permitido.',
        )
        previous = null
      } else {
        try {
          const parsed = parseSection(response, section, allowedIds)
          const hasUnsupportedNumbers =
            unsupportedNumbers(parsed.content, information).length > 0
          const isTooShort =
            minimumContentWords > 0 &&
            wordCount(parsed.content) < minimumContentWords
          if (hasUnsupportedNumbers || isTooShort) {
            if (attempt >= 1) {
              // A concise supported section is better than replacing it with
              // the entire narrative repeated under every heading.
              if (!hasUnsupportedNumbers) return parsed
              logger.warn('REPORT_SECTION_GROUNDED_FALLBACK', {
                sectionId: section.sectionId,
                sectionIndex: index + 1,
                total,
                reason: hasUnsupportedNumbers
                  ? 'unsupported-numeric-claims'
                  : 'insufficient-grounded-detail',
              })
              return groundedSectionFallback(section, information, evidence)
            }
            throw new ReportGenerationServiceError(
              hasUnsupportedNumbers
                ? 'A IA incluiu um número que não foi fornecido pelo usuário.'
                : 'A IA resumiu demais as evidências fornecidas pelo usuário.',
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
      : new ReportGenerationServiceError(
          'Não foi possível validar a seção gerada.',
        )
  }
}
