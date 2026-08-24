export type StructureFieldType = 'text' | 'date' | 'number' | 'boolean'

export interface FieldEvidence {
  source: 'paragraph' | 'table' | 'header' | 'footer'
  elementId: string
  excerpt: string
  reason: string
}

export interface StructureField {
  name: string
  label: string
  type: StructureFieldType
  required: boolean
  evidence: FieldEvidence[]
}

export interface SectionPattern {
  name: string
  level: number
  order: number
  purpose: string | null
  required: boolean
  repeatable: boolean
  children: SectionPattern[]
}

export interface ActivityPattern {
  namePattern: string
  sections: string[]
  order: number
  repeatable: boolean
  fields: StructureField[]
}

export interface RecurringElement {
  type: 'section' | 'list' | 'table' | 'figure' | 'field'
  name: string
  occurrences: number
  evidence: string[]
}

export interface StructurePattern {
  documentType: string
  mainTitle: string | null
  hierarchy: SectionPattern[]
  sections: SectionPattern[]
  activityPatterns: ActivityPattern[]
  fields: StructureField[]
  recurringElements: RecurringElement[]
  optionalElements: string[]
  requiredElements: string[]
}
