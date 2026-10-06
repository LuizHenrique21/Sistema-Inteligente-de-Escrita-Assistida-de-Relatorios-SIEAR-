import type { JSZipObject } from 'jszip'

export interface DocxProcessingLimits {
  maxCompressedBytes: number
  maxUncompressedBytes: number
  maxZipEntries: number
  maxXmlEntryBytes: number
  maxImages: number
  maxTotalImageBytes: number
  maxParagraphs: number
  maxTables: number
  maxSections: number
  maxStructuralDepth: number
  maxExpansionRatio: number
}

export interface DocxArchiveStats {
  entryCount: number
  compressedBytes: number
  uncompressedBytes: number
  xmlEntryBytes: number
  imageCount: number
  totalImageBytes: number
  expansionRatio: number
}

const MB = 1024 * 1024

// Calibrated from the SIEAR reference report in the repository root:
// 2.9 MB compressed, 3.8 MB expanded, 49 entries, 563 KB largest XML and
// 32 images. Defaults keep a wide operational margin for image-heavy reports
// while still rejecting local-PC hostile archives before expensive parsing.
export const DEFAULT_DOCX_PROCESSING_LIMITS: DocxProcessingLimits = {
  maxCompressedBytes: 50 * MB,
  maxUncompressedBytes: 250 * MB,
  maxZipEntries: 2_000,
  maxXmlEntryBytes: 12 * MB,
  maxImages: 200,
  maxTotalImageBytes: 200 * MB,
  maxParagraphs: 12_000,
  maxTables: 500,
  maxSections: 500,
  maxStructuralDepth: 64,
  maxExpansionRatio: 25,
}

function envNumber(name: string): number | null {
  const value = process.env[name]
  if (!value) return null
  const parsed = Number(value)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null
}

export function resolveDocxProcessingLimits(
  overrides: Partial<DocxProcessingLimits> = {},
): DocxProcessingLimits {
  return {
    maxCompressedBytes:
      envNumber('SIEAR_DOCX_MAX_COMPRESSED_BYTES') ??
      overrides.maxCompressedBytes ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxCompressedBytes,
    maxUncompressedBytes:
      envNumber('SIEAR_DOCX_MAX_UNCOMPRESSED_BYTES') ??
      overrides.maxUncompressedBytes ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxUncompressedBytes,
    maxZipEntries:
      envNumber('SIEAR_DOCX_MAX_ZIP_ENTRIES') ??
      overrides.maxZipEntries ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxZipEntries,
    maxXmlEntryBytes:
      envNumber('SIEAR_DOCX_MAX_XML_ENTRY_BYTES') ??
      overrides.maxXmlEntryBytes ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxXmlEntryBytes,
    maxImages:
      envNumber('SIEAR_DOCX_MAX_IMAGES') ??
      overrides.maxImages ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxImages,
    maxTotalImageBytes:
      envNumber('SIEAR_DOCX_MAX_TOTAL_IMAGE_BYTES') ??
      overrides.maxTotalImageBytes ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxTotalImageBytes,
    maxParagraphs:
      envNumber('SIEAR_DOCX_MAX_PARAGRAPHS') ??
      overrides.maxParagraphs ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxParagraphs,
    maxTables:
      envNumber('SIEAR_DOCX_MAX_TABLES') ??
      overrides.maxTables ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxTables,
    maxSections:
      envNumber('SIEAR_DOCX_MAX_SECTIONS') ??
      overrides.maxSections ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxSections,
    maxStructuralDepth:
      envNumber('SIEAR_DOCX_MAX_STRUCTURAL_DEPTH') ??
      overrides.maxStructuralDepth ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxStructuralDepth,
    maxExpansionRatio:
      envNumber('SIEAR_DOCX_MAX_EXPANSION_RATIO') ??
      overrides.maxExpansionRatio ??
      DEFAULT_DOCX_PROCESSING_LIMITS.maxExpansionRatio,
  }
}

function entrySizes(entry: JSZipObject): {
  compressedBytes: number
  uncompressedBytes: number
} {
  const metadata = entry as JSZipObject & {
    _data?: { compressedSize?: number; uncompressedSize?: number }
  }
  return {
    compressedBytes: metadata._data?.compressedSize ?? 0,
    uncompressedBytes: metadata._data?.uncompressedSize ?? 0,
  }
}

export function inspectDocxArchive(
  files: Record<string, JSZipObject>,
): DocxArchiveStats {
  let entryCount = 0
  let compressedBytes = 0
  let uncompressedBytes = 0
  let xmlEntryBytes = 0
  let imageCount = 0
  let totalImageBytes = 0

  for (const [name, entry] of Object.entries(files)) {
    if (entry.dir) continue
    entryCount += 1
    const sizes = entrySizes(entry)
    compressedBytes += sizes.compressedBytes
    uncompressedBytes += sizes.uncompressedBytes
    if (/\.xml(?:\.rels)?$/i.test(name))
      xmlEntryBytes = Math.max(xmlEntryBytes, sizes.uncompressedBytes)
    if (/^word\/media\//i.test(name)) {
      imageCount += 1
      totalImageBytes += sizes.uncompressedBytes
    }
  }

  return {
    entryCount,
    compressedBytes,
    uncompressedBytes,
    xmlEntryBytes,
    imageCount,
    totalImageBytes,
    expansionRatio:
      compressedBytes > 0 ? uncompressedBytes / compressedBytes : 0,
  }
}

export function firstDocxLimitViolation(
  stats: DocxArchiveStats,
  limits: DocxProcessingLimits,
): string | null {
  if (stats.entryCount > limits.maxZipEntries)
    return `DOCX possui ${stats.entryCount} entradas ZIP; limite ${limits.maxZipEntries}.`
  if (stats.uncompressedBytes > limits.maxUncompressedBytes)
    return `DOCX expande para ${stats.uncompressedBytes} bytes; limite ${limits.maxUncompressedBytes}.`
  if (stats.expansionRatio > limits.maxExpansionRatio)
    return `DOCX possui razao de expansao ${stats.expansionRatio.toFixed(1)}x; limite ${limits.maxExpansionRatio}x.`
  if (stats.xmlEntryBytes > limits.maxXmlEntryBytes)
    return `DOCX possui XML de ${stats.xmlEntryBytes} bytes; limite ${limits.maxXmlEntryBytes}.`
  if (stats.imageCount > limits.maxImages)
    return `DOCX possui ${stats.imageCount} imagens; limite ${limits.maxImages}.`
  if (stats.totalImageBytes > limits.maxTotalImageBytes)
    return `DOCX possui ${stats.totalImageBytes} bytes em imagens; limite ${limits.maxTotalImageBytes}.`
  return null
}

export function maxXmlStructuralDepth(xml: string): number {
  let depth = 0
  let maxDepth = 0
  for (const match of xml.matchAll(
    /<\/?([A-Za-z_][\w:.-]*)(?:\s[^>]*)?>/g,
  )) {
    const tag = match[0]
    if (tag.startsWith('</')) {
      depth = Math.max(0, depth - 1)
    } else if (
      !tag.endsWith('/>') &&
      !tag.startsWith('<?') &&
      !tag.startsWith('<!--')
    ) {
      depth += 1
      maxDepth = Math.max(maxDepth, depth)
    }
  }
  return maxDepth
}
