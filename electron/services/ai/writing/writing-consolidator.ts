import type {
  WritingEvidence,
  WritingPattern,
  WritingRule,
} from '../../../../src/domain/templates'
import type { WritingAnalysisContext } from './writing-context'
import {
  GLOBAL_RULE_KINDS,
  SECTION_RULE_KINDS,
  validateUnit,
  writingUnitSchema,
  type WritingUnitResult,
} from './writing-contract'

export function consolidateWriting(
  context: WritingAnalysisContext,
  global: WritingUnitResult,
  sections: WritingUnitResult[],
): WritingPattern {
  if (
    validateUnit(global, writingUnitSchema(context.allowedEvidenceIds)).length
  )
    throw new Error('Invalid global consolidation input')
  const byId = new Map(sections.map((section) => [section.sectionId, section]))
  if (
    sections.length !== context.sections.length ||
    byId.size !== sections.length
  )
    throw new Error('Missing or duplicate writing section')
  const sources = new Map(
    context.sections.flatMap((section) =>
      section.samples.map(
        (sample) =>
          [
            sample.id,
            { sectionName: section.originalName, excerpt: sample.text },
          ] as const,
      ),
    ),
  )
  const evidence = (ids: string[], reason: string): WritingEvidence[] =>
    ids.map((id) => {
      const source = sources.get(id)
      if (!source) throw new Error('Unknown writing evidence')
      return { ...source, reason }
    })
  const rules = (unit: WritingUnitResult, kind: string): WritingRule[] =>
    unit.rules
      .filter((rule) => rule.kind === kind)
      .map((rule) => ({
        rule: rule.rule,
        justification: rule.justification,
        evidence: evidence(rule.evidenceIds, rule.justification),
      }))
  const globalRules = Object.fromEntries(
    GLOBAL_RULE_KINDS.map((kind) => [kind, rules(global, kind)]),
  ) as Pick<WritingPattern, (typeof GLOBAL_RULE_KINDS)[number]>
  return {
    globalStyle: {
      ...global.profile,
      averageParagraphWords: context.deterministicMetrics.averageParagraphWords,
      evidence: evidence(
        global.evidenceIds,
        'Amostra utilizada para inferir o perfil global.',
      ),
    },
    ...globalRules,
    sectionStyles: context.sections.map((section) => {
      const result = byId.get(section.sectionId)
      if (
        !result ||
        validateUnit(
          result,
          writingUnitSchema(section.allowedEvidenceIds, section.sectionId),
        ).length
      )
        throw new Error('Invalid section consolidation input')
      const sectionRules = Object.fromEntries(
        SECTION_RULE_KINDS.map((kind) => [kind, rules(result, kind)]),
      ) as Record<(typeof SECTION_RULE_KINDS)[number], WritingRule[]>
      return {
        ...result.profile,
        sectionName: section.originalName,
        averageParagraphWords:
          section.deterministicMetrics.averageParagraphWords,
        evidence: evidence(
          result.evidenceIds,
          'Amostra utilizada para inferir o perfil da seção.',
        ),
        ...sectionRules,
      }
    }),
  }
}
