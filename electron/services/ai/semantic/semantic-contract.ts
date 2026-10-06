export const SEMANTIC_ANALYZER_VERSION = '3'
export const SEMANTIC_SCHEMA_VERSION = '2'
export const SEMANTIC_GLOBAL_PROMPT_VERSION = '2'
export const SEMANTIC_SECTION_PROMPT_VERSION = '2'
export const SEMANTIC_RELATIONS_PROMPT_VERSION = '2'
export const SEMANTIC_SETTINGS = {
  maxRetries: 2,
  temperature: 0,
  think: false,
  globalTokens: 1024,
  sectionTokens: 1024,
  relationsTokens: 768,
  maxResponseCharacters: 10_000,
} as const

export const INFORMATION_TYPES = [
  'context',
  'fact',
  'action',
  'cause',
  'procedure',
  'result',
  'validation',
  'field',
  'other',
] as const
export const RELATION_TYPES = [
  'supports',
  'precedes',
  'elaborates',
  'references',
] as const

export interface SemanticValidationIssue {
  path: string
  code: string
  allowedValues?: readonly string[]
}
export interface SemanticSchema {
  type: 'object' | 'string' | 'array'
  properties?: Record<string, SemanticSchema>
  required?: string[]
  additionalProperties?: false
  enum?: readonly string[]
  minLength?: number
  maxLength?: number
  items?: SemanticSchema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}
export interface GlobalSemanticResult {
  documentPurpose: string
  overallInformationFlow: string[]
  generalSemanticRules: Array<{
    rule: string
    justification: string
    evidenceIds: string[]
  }>
  fieldRoles: Array<{
    fieldId: string
    semanticRole: string
    evidenceIds: string[]
  }>
}
export interface SectionSemanticResult {
  sectionId: string
  purpose: string
  expectedInformation: Array<{
    name: string
    description: string
    informationType: (typeof INFORMATION_TYPES)[number]
    requirement: 'common' | 'required'
    supportIds: string[]
  }>
  excludedInformation: Array<{
    rule: string
    justification: string
    evidenceIds: string[]
  }>
  evidenceIds: string[]
}
export interface SemanticRelationsResult {
  relations: Array<{
    sourceSectionId: string
    targetSectionId: string
    relationType: (typeof RELATION_TYPES)[number]
  }>
}

const object = (properties: Record<string, SemanticSchema>): SemanticSchema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
const string = (maxLength = 160): SemanticSchema => ({
  type: 'string',
  minLength: 1,
  maxLength,
})
const ids = (allowed: string[], minimum = 1): SemanticSchema => ({
  type: 'array',
  items: { type: 'string', enum: allowed },
  minItems: minimum,
  maxItems: 3,
  uniqueItems: true,
})
const rule = (evidenceIds: string[]): SemanticSchema =>
  object({
    rule: string(140),
    justification: string(140),
    evidenceIds: ids(evidenceIds),
  })

export function globalSemanticSchema(
  sectionIds: string[],
  evidenceIds: string[],
  fields: Array<{ fieldId: string; evidenceIds: string[] }>,
): SemanticSchema {
  return object({
    documentPurpose: string(180),
    overallInformationFlow: {
      type: 'array',
      items: { type: 'string', enum: sectionIds },
      minItems: sectionIds.length ? 1 : 0,
      maxItems: sectionIds.length,
      uniqueItems: true,
    },
    generalSemanticRules: {
      type: 'array',
      items: rule(evidenceIds),
      maxItems: 3,
    },
    fieldRoles: {
      type: 'array',
      minItems: fields.length,
      maxItems: fields.length,
      items: object({
        fieldId: { type: 'string', enum: fields.map((field) => field.fieldId) },
        semanticRole: string(140),
        evidenceIds: ids(fields.flatMap((field) => field.evidenceIds)),
      }),
    },
  })
}

export function sectionSemanticSchema(
  sectionId: string,
  supportIds: string[],
  evidenceIds: string[],
  requiredSupportIds: string[],
): SemanticSchema {
  return object({
    sectionId: { type: 'string', enum: [sectionId] },
    purpose: string(180),
    expectedInformation: {
      type: 'array',
      maxItems: 8,
      items: object({
        name: string(100),
        description: string(180),
        informationType: { type: 'string', enum: INFORMATION_TYPES },
        requirement: {
          type: 'string',
          enum: requiredSupportIds.length ? ['common', 'required'] : ['common'],
        },
        supportIds: ids(supportIds),
      }),
    },
    excludedInformation: {
      type: 'array',
      maxItems: 0,
      items: rule(evidenceIds),
    },
    evidenceIds: ids(evidenceIds),
  })
}

export function semanticRelationsSchema(sectionIds: string[]): SemanticSchema {
  return object({
    relations: {
      type: 'array',
      maxItems: Math.max(0, sectionIds.length * 2),
      items: object({
        sourceSectionId: { type: 'string', enum: sectionIds },
        targetSectionId: { type: 'string', enum: sectionIds },
        relationType: { type: 'string', enum: RELATION_TYPES },
      }),
    },
  })
}

export function validateSemanticUnit(
  value: unknown,
  schema: SemanticSchema,
  path = '$',
): SemanticValidationIssue[] {
  const issue = (
    code: string,
    allowedValues?: readonly string[],
  ): SemanticValidationIssue[] => [
    { path, code, ...(allowedValues ? { allowedValues } : {}) },
  ]
  if (schema.type === 'string') {
    if (typeof value !== 'string') return issue('INVALID_TYPE')
    if (schema.enum && !schema.enum.includes(value)) {
      const code = path.endsWith('sectionId')
        ? 'UNKNOWN_SEMANTIC_SECTION'
        : path.includes('evidenceIds') || path.includes('supportIds')
          ? 'UNKNOWN_SEMANTIC_EVIDENCE'
          : 'INVALID_ENUM'
      return issue(code, schema.enum)
    }
    if (
      !value.trim() ||
      value.length < (schema.minLength ?? 0) ||
      value.length > (schema.maxLength ?? Infinity)
    )
      return issue('INVALID_STRING_LENGTH')
    return []
  }
  if (schema.type === 'array') {
    if (!Array.isArray(value)) return issue('INVALID_TYPE')
    const issues =
      value.length < (schema.minItems ?? 0) ||
      value.length > (schema.maxItems ?? Infinity)
        ? issue('INVALID_ARRAY_LENGTH')
        : []
    if (schema.uniqueItems && new Set(value).size !== value.length)
      issues.push(...issue('DUPLICATE_ID'))
    return [
      ...issues,
      ...value
        .slice(0, 30)
        .flatMap((entry, index) =>
          validateSemanticUnit(entry, schema.items!, `${path}[${index}]`),
        ),
    ]
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return issue('INVALID_TYPE')
  const item = value as Record<string, unknown>
  const properties = schema.properties!
  const issues = Object.keys(item).some((key) => !Object.hasOwn(properties, key))
    ? issue('UNKNOWN_FIELD')
    : []
  for (const [key, child] of Object.entries(properties)) {
    if (!Object.hasOwn(item, key))
      issues.push({ path: `${path}.${key}`, code: 'MISSING_FIELD' })
    else
      issues.push(...validateSemanticUnit(item[key], child, `${path}.${key}`))
  }
  return issues
}
