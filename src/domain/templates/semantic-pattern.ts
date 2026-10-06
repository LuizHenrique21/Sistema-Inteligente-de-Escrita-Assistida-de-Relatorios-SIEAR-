import type { StructureFieldType } from './structure-pattern'

export interface SemanticEvidence {
  sectionName: string | null
  excerpt: string
  reason: string
}

export interface SemanticRule {
  rule: string
  justification: string
  evidence: SemanticEvidence[]
}

export interface ExpectedInformation {
  name: string
  description: string
  informationType:
    | 'context'
    | 'fact'
    | 'action'
    | 'cause'
    | 'procedure'
    | 'result'
    | 'validation'
    | 'field'
    | 'other'
  required: boolean
  evidence: SemanticEvidence[]
}

export interface SectionRelationship {
  sourceSection?: string
  targetSection: string
  relationship: string
  evidence: SemanticEvidence[]
}

export interface GlobalSemanticProfile {
  documentPurpose: string
  overallInformationFlow: string[]
  generalSemanticRules: SemanticRule[]
}

export interface SectionSemanticPattern {
  sectionName: string
  purpose: string
  expectedInformation: ExpectedInformation[]
  excludedInformation: SemanticRule[]
  informationOrder: string[]
  relationships: SectionRelationship[]
  narrativePattern: string
  detailLevel: string
  evidence: SemanticEvidence[]
}

export interface SemanticFieldPattern {
  name: string
  label: string
  semanticRole: string
  valueType: StructureFieldType
  required: boolean
  evidence: SemanticEvidence[]
}

export interface ActivitySemanticPattern {
  namePattern: string
  occurrenceCount: number
  sectionSequence: string[]
  semanticFlow: string[]
  evidence: SemanticEvidence[]
}

export interface SemanticPattern {
  documentType: string
  globalProfile?: GlobalSemanticProfile
  sections: SectionSemanticPattern[]
  activityPatterns: ActivitySemanticPattern[]
  fields: SemanticFieldPattern[]
  crossSectionRelations: SectionRelationship[]
  uncertainties: SemanticRule[]
}
