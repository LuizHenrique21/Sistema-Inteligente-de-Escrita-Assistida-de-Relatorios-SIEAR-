export interface CollectionParagraph {
  text: string
  excluded?: boolean
}

export function isReportPlaceholder(value: string): boolean {
  return /x{4,}|escrever detalhadamente|inserir link/i.test(value)
}

function key(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(/[:.]$/, '')
    .trim()
}

/** Same structural detection for fresh DOCX imports and legacy saved extractions. */
export function detectReportCollection(
  paragraphs: CollectionParagraph[],
  headingNames: Set<string>,
): { indexes: number[]; end: number; instances: number } | null {
  const counts = new Map<string, number>()
  for (const item of paragraphs)
    counts.set(key(item.text), (counts.get(key(item.text)) ?? 0) + 1)
  const labels = paragraphs.flatMap((item, index) =>
    item.text.length >= 3 &&
    item.text.length <= 100 &&
    item.text.split(/\s+/).length <= 12 &&
    (counts.get(key(item.text)) ?? 0) >= 2 &&
    !isReportPlaceholder(item.text) &&
    !/[.!?;]$|:\s*\S|^\[/.test(item.text) &&
    !item.excluded
      ? [index]
      : [],
  )
  const firstLabel =
    labels[0] === undefined ? '' : key(paragraphs[labels[0]]!.text)
  const starts = labels.filter(
    (index) => key(paragraphs[index]!.text) === firstLabel,
  )
  const candidates = starts.map((start, index) => {
    const end = starts[index + 1] ?? paragraphs.length
    const indexes = labels.filter((item) => item >= start && item < end)
    const signature = indexes
      .map((item) => key(paragraphs[item]!.text))
      .join('|')
    const firstBody = paragraphs
      .slice(start + 1, indexes[1] ?? end)
      .filter((item) => item.text)
    return {
      end,
      indexes,
      signature,
      valid:
        new Set(indexes.map((item) => key(paragraphs[item]!.text))).size ===
          indexes.length &&
        firstBody.some(
          (item) => item.text.length > 60 && !isReportPlaceholder(item.text),
        ) &&
        !firstBody.some((item) => isReportPlaceholder(item.text)),
    }
  })
  const repeated = candidates.filter(
    (item) =>
      item.valid &&
      item.indexes.length >= 2 &&
      candidates.filter(
        (other) => other.valid && other.signature === item.signature,
      ).length >= 2,
  )
  if (!repeated.length) return null
  const selected = [...repeated].sort(
    (a, b) =>
      repeated.filter((item) => item.signature === b.signature).length -
      repeated.filter((item) => item.signature === a.signature).length,
  )[0]!
  let end = selected.end
  for (let index = selected.indexes.at(-1)! + 1; index < end; index++) {
    const item = paragraphs[index]!
    if (
      /^\[.*\]|^[^:]{2,40}:\s*\S/.test(item.text) ||
      headingNames.has(item.text)
    ) {
      end = index
      break
    }
  }
  return {
    indexes: selected.indexes,
    end,
    instances: repeated.filter((item) => item.signature === selected.signature)
      .length,
  }
}
