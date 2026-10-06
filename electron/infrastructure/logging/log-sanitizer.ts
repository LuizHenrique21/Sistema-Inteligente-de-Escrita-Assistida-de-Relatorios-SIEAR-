import type { LogMetadata, SerializedLogError } from './logger.types'

const SENSITIVE_KEYS = new Set([
  'password',
  'token',
  'apikey',
  'authorization',
  'secret',
  'prompt',
  'response',
  'content',
  'text',
  'document',
  'documentrepresentation',
  'databasepath',
  'filepath',
  'path',
])
const REDACTED = '[REDACTED]'

function safeValue(
  value: unknown,
  seen: WeakSet<object>,
  depth: number,
): unknown {
  if (depth > 6) return '[MAX_DEPTH]'
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value))
    return value
  if (typeof value === 'bigint') return value.toString()
  if (value instanceof Error) return serializeError(value)
  if (Array.isArray(value))
    return value.slice(0, 50).map((item) => safeValue(item, seen, depth + 1))
  if (typeof value !== 'object') return String(value)
  if (seen.has(value)) return '[CIRCULAR]'
  seen.add(value)
  const result: LogMetadata = {}
  for (const [key, entry] of Object.entries(value)) {
    result[key] = SENSITIVE_KEYS.has(key.toLocaleLowerCase())
      ? REDACTED
      : safeValue(entry, seen, depth + 1)
  }
  seen.delete(value)
  return result
}

export function sanitizeLogMetadata(metadata: LogMetadata = {}): LogMetadata {
  return safeValue(metadata, new WeakSet(), 0) as LogMetadata
}

export function serializeError(error: unknown): SerializedLogError {
  if (!(error instanceof Error))
    return { name: 'UnknownError', message: String(error) }
  const code =
    'code' in error && typeof error.code === 'string' ? error.code : undefined
  return {
    name: error.name,
    message: error.message,
    ...(error.stack ? { stack: error.stack } : {}),
    ...(code ? { code } : {}),
  }
}
