export function compactPromptJson(value: unknown): string {
  return JSON.stringify(value)
}

export function documentData(value: string): string {
  if (
    value.startsWith('DOCUMENT_DATA_BEGIN\n') &&
    value.endsWith('\nDOCUMENT_DATA_END')
  )
    return value
  return `DOCUMENT_DATA_BEGIN\n${value}\nDOCUMENT_DATA_END`
}
