import type { StructurePattern } from '../../../../src/domain/templates'
import type { DocumentRepresentation } from '../../documents/types'
import { hashCheckpointResult } from '../../templates/pipeline-checkpoint.hash'
import { buildWritingAnalysisInput } from '../prompts/writing-analysis.prompt'

export interface WritingSample {
  id: string
  sectionId: string
  text: string
}
export interface WritingMetrics {
  sampleCount: number
  paragraphCount: number
  averageParagraphWords: number
}
export interface WritingSectionContext {
  sectionId: string
  canonicalName: string
  originalName: string
  samples: WritingSample[]
  allowedEvidenceIds: string[]
  deterministicMetrics: WritingMetrics
}
export interface WritingAnalysisContext {
  documentId: string
  documentType: string
  sections: WritingSectionContext[]
  globalSamples: WritingSample[]
  allowedSectionIds: string[]
  allowedEvidenceIds: string[]
  deterministicMetrics: WritingMetrics
}
export function canonicalWritingName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}
function metrics(samples: WritingSample[]): WritingMetrics {
  const counts = samples.map((s) => s.text.split(/\s+/u).filter(Boolean).length)
  return {
    sampleCount: samples.length,
    paragraphCount: samples.length,
    averageParagraphWords: counts.length
      ? counts.reduce((a, b) => a + b, 0) / counts.length
      : 0,
  }
}
function spread<T>(items: T[], limit: number): T[] {
  if (items.length <= limit) return items
  return Array.from(
    { length: limit },
    (_, index) =>
      items[Math.round((index * (items.length - 1)) / (limit - 1))]!,
  )
}
export function createWritingContext(
  document: DocumentRepresentation,
  structure: StructurePattern,
): WritingAnalysisContext {
  // Keep the shared sampling contract used by SemanticAnalysis unchanged.
  const input = buildWritingAnalysisInput(document, structure)
  const sections = input.sections
    .filter((s) => s.samples.length)
    .map((s, index): WritingSectionContext => {
      const sectionId = `section-${String(index + 1).padStart(3, '0')}`
      const samples = s.samples.map((text, i) => ({
        id: `${sectionId}-evidence-${i + 1}`,
        sectionId,
        text,
      }))
      return {
        sectionId,
        canonicalName: canonicalWritingName(s.name),
        originalName: s.name,
        samples,
        allowedEvidenceIds: samples.map((s) => s.id),
        deterministicMetrics: metrics(samples),
      }
    })
  // Round-robin across evenly distributed sections gives diversity before depth.
  const selected = spread(sections, 6)
  const globalSamples: WritingSample[] = []
  for (let round = 0; round < 3 && globalSamples.length < 6; round++) {
    for (const [index, section] of selected.entries()) {
      const sample = section.samples[(index + round) % section.samples.length]!
      if (!globalSamples.some((s) => s.id === sample.id))
        globalSamples.push(sample)
      if (globalSamples.length === 6) break
    }
  }
  return {
    documentId: hashCheckpointResult({
      documentType: input.documentType,
      sections,
    }),
    documentType: input.documentType,
    sections,
    globalSamples,
    allowedSectionIds: sections.map((s) => s.sectionId),
    allowedEvidenceIds: globalSamples.map((s) => s.id),
    deterministicMetrics: metrics(sections.flatMap((s) => s.samples)),
  }
}
