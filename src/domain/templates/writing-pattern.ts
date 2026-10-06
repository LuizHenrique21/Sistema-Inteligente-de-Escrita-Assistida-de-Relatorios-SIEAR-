export interface WritingEvidence {
  sectionName: string | null
  excerpt: string
  reason: string
}

export interface WritingRule {
  rule: string
  justification: string
  evidence: WritingEvidence[]
}

export interface WritingStyleProfile {
  tone: string
  formality: string
  technicality: string
  objectivity: string
  averageParagraphWords: number
  sentenceComplexity: string
  grammaticalPerson: string
  verbTense: string
  voice: string
  firstPersonUsage: string
  thirdPersonUsage: string
  detailLevel: string
  narrativeStyle: string
  evidence: WritingEvidence[]
}

export interface SectionWritingStyle extends WritingStyleProfile {
  sectionName: string
  introductionPatterns: WritingRule[]
  developmentPatterns: WritingRule[]
  conclusionPatterns: WritingRule[]
}

export interface WritingPattern {
  globalStyle: WritingStyleProfile
  sectionStyles: SectionWritingStyle[]
  vocabulary: WritingRule[]
  terminology: WritingRule[]
  sentencePatterns: WritingRule[]
  paragraphPatterns: WritingRule[]
  narrativePatterns: WritingRule[]
  forbiddenPatterns: WritingRule[]
  recommendedPatterns: WritingRule[]
}
