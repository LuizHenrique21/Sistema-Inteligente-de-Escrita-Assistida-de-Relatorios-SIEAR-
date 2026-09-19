export const WRITING_ANALYZER_VERSION = '6'
export const WRITING_SCHEMA_VERSION = '1'
export const GLOBAL_PROMPT_VERSION = '1'
export const SECTION_PROMPT_VERSION = '1'
export const WRITING_SETTINGS = {
  maxRetries: 2,
  temperature: 0,
  think: false,
  globalTokens: 1536,
  sectionTokens: 1024,
  maxResponseCharacters: 12000,
} as const

const unknown = 'não identificado'
export const PROFILE_ENUMS = {
  tone: ['técnico', 'formal', 'neutro', 'informal', 'misto', unknown],
  formality: ['alta', 'média', 'baixa', 'mista', unknown],
  technicality: ['alta', 'média', 'baixa', 'mista', unknown],
  objectivity: ['alta', 'média', 'baixa', 'mista', unknown],
  sentenceComplexity: ['simples', 'moderada', 'complexa', 'mista', unknown],
  grammaticalPerson: [
    'primeira pessoa',
    'segunda pessoa',
    'terceira pessoa',
    'impessoal',
    'mista',
    unknown,
  ],
  verbTense: ['passado', 'presente', 'futuro', 'misto', unknown],
  voice: ['ativa', 'passiva', 'impessoal', 'mista', unknown],
  firstPersonUsage: ['ausente', 'ocasional', 'predominante', unknown],
  thirdPersonUsage: ['ausente', 'ocasional', 'predominante', unknown],
  detailLevel: ['resumido', 'moderado', 'detalhado', 'misto', unknown],
  narrativeStyle: [
    'descritivo',
    'procedimental',
    'argumentativo',
    'expositivo',
    'narrativo',
    'misto',
    unknown,
  ],
} as const
export const GLOBAL_RULE_KINDS = [
  'vocabulary',
  'terminology',
  'sentencePatterns',
  'paragraphPatterns',
  'narrativePatterns',
  'forbiddenPatterns',
  'recommendedPatterns',
] as const
export const SECTION_RULE_KINDS = [
  'introductionPatterns',
  'developmentPatterns',
  'conclusionPatterns',
] as const
export type Profile = {
  -readonly [K in keyof typeof PROFILE_ENUMS]: (typeof PROFILE_ENUMS)[K][number]
}
export interface WritingUnitResult {
  sectionId?: string
  profile: Profile
  evidenceIds: string[]
  rules: Array<{
    kind:
      (typeof GLOBAL_RULE_KINDS)[number] | (typeof SECTION_RULE_KINDS)[number]
    rule: string
    justification: string
    evidenceIds: string[]
  }>
}
export interface ValidationIssue {
  path: string
  code: string
  allowedValues?: readonly string[]
}
export interface Schema {
  type: 'object' | 'string' | 'array'
  properties?: Record<string, Schema>
  required?: string[]
  additionalProperties?: false
  enum?: readonly string[]
  minLength?: number
  maxLength?: number
  items?: Schema
  minItems?: number
  maxItems?: number
  uniqueItems?: boolean
}
const object = (properties: Record<string, Schema>): Schema => ({
  type: 'object',
  properties,
  required: Object.keys(properties),
  additionalProperties: false,
})
export function writingUnitSchema(
  evidenceIds: string[],
  sectionId?: string,
): Schema {
  const ids: Schema = {
    type: 'array',
    items: { type: 'string', enum: evidenceIds },
    minItems: 1,
    maxItems: 2,
    uniqueItems: true,
  }
  return object({
    ...(sectionId
      ? { sectionId: { type: 'string' as const, enum: [sectionId] } }
      : {}),
    profile: object(
      Object.fromEntries(
        Object.entries(PROFILE_ENUMS).map(([key, values]) => [
          key,
          { type: 'string', enum: values },
        ]),
      ),
    ),
    evidenceIds: ids,
    rules: {
      type: 'array',
      maxItems: sectionId ? 3 : 4,
      items: object({
        kind: {
          type: 'string',
          enum: sectionId ? SECTION_RULE_KINDS : GLOBAL_RULE_KINDS,
        },
        rule: { type: 'string', minLength: 1, maxLength: 120 },
        justification: { type: 'string', minLength: 1, maxLength: 120 },
        evidenceIds: ids,
      }),
    },
  })
}

// Validate exactly the subset of JSON Schema produced above, including nested objects.
// Paths never include untrusted property names or document text.
export function validateUnit(
  value: unknown,
  schema: Schema,
  path = '$',
): ValidationIssue[] {
  const issue = (
    code: string,
    allowedValues?: readonly string[],
  ): ValidationIssue[] => [
    { path, code, ...(allowedValues ? { allowedValues } : {}) },
  ]
  if (schema.type === 'string') {
    if (typeof value !== 'string') return issue('INVALID_TYPE')
    if (schema.enum && !schema.enum.includes(value))
      return issue(
        path.endsWith('sectionId')
          ? 'UNKNOWN_SECTION_ID'
          : path.includes('evidenceIds')
            ? 'UNKNOWN_EVIDENCE_ID'
            : 'INVALID_ENUM',
        schema.enum,
      )
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
        .slice(0, 20)
        .flatMap((entry, i) =>
          validateUnit(entry, schema.items!, `${path}[${i}]`),
        ),
    ]
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return issue('INVALID_TYPE')
  const item = value as Record<string, unknown>
  const properties = schema.properties!
  const issues = Object.keys(item).some(
    (key) => !Object.hasOwn(properties, key),
  )
    ? issue('UNKNOWN_FIELD')
    : []
  for (const [key, child] of Object.entries(properties)) {
    if (!Object.hasOwn(item, key))
      issues.push({ path: `${path}.${key}`, code: 'MISSING_FIELD' })
    else issues.push(...validateUnit(item[key], child, `${path}.${key}`))
  }
  return issues
}

export function normalizeClassifications(value: unknown): unknown {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return value
  const result = structuredClone(value) as Record<string, unknown>
  if (
    typeof result.profile !== 'object' ||
    result.profile === null ||
    Array.isArray(result.profile)
  )
    return result
  const profile = result.profile as Record<string, unknown>
  for (const key of Object.keys(PROFILE_ENUMS)) {
    if (typeof profile[key] === 'string' && profile[key].trim() === '')
      profile[key] = unknown
  }
  return result
}
