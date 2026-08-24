import type { StructurePattern } from '../../../../src/domain/templates/structure-pattern'
import type { DocumentRepresentation } from '../../documents/types'

export const WRITING_ANALYSIS_PROMPT_VERSION = '1' as const

export interface WritingSectionSample {
  name: string
  level: number
  purpose: string | null
  samples: string[]
  paragraphWordCounts: number[]
}

export interface WritingAnalysisInput {
  documentType: string
  hierarchy: Array<{ name: string; level: number; order: number }>
  activityPatterns: Array<{ namePattern: string; sections: string[] }>
  sections: WritingSectionSample[]
}

function redactSpecificData(value: string): string {
  return value
    .replace(/\b[\w.+-]+@[\w.-]+\.[A-Za-z]{2,}\b/g, '[EMAIL]')
    .replace(/\b\d{1,2}[/-]\d{1,2}[/-]\d{2,4}\b/g, '[DATA]')
    .replace(
      /\b(?:CPF|CNPJ|RG|ID|código)\s*[:#-]?\s*[A-Z0-9./-]+\b/gi,
      '[IDENTIFICADOR]',
    )
    .replace(/\b\d{6,}\b/g, '[NÚMERO]')
}

function representativeSamples(value: string): string[] {
  const paragraphs = value
    .split(/\r?\n+/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean)
  if (paragraphs.length <= 3)
    return paragraphs.map((item) => redactSpecificData(item.slice(0, 700)))
  const indexes = [0, Math.floor(paragraphs.length / 2), paragraphs.length - 1]
  return indexes.map((index) =>
    redactSpecificData((paragraphs[index] ?? '').slice(0, 700)),
  )
}

function normalizedName(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function matchesSection(
  sourceName: string,
  patternName: string,
  repeatable: boolean,
): boolean {
  const source = normalizedName(sourceName)
  const pattern = normalizedName(patternName)
  return (
    source === pattern ||
    (repeatable &&
      (source.startsWith(`${pattern} `) || pattern.startsWith(`${source} `)))
  )
}

export function buildWritingAnalysisInput(
  document: DocumentRepresentation,
  structure: StructurePattern,
): WritingAnalysisInput {
  const uniquePatterns = new Map(
    structure.sections.map((section) => [
      normalizedName(section.name),
      section,
    ]),
  )
  const sections = [...uniquePatterns.values()].map((pattern) => {
    const sources = document.sections.filter((section) =>
      matchesSection(section.title, pattern.name, pattern.repeatable),
    )
    const samples = representativeSamples(
      sources
        .map((source) => source.content)
        .filter(Boolean)
        .join('\n'),
    )
    return {
      name: pattern.name,
      level: pattern.level,
      purpose: pattern.purpose,
      samples,
      paragraphWordCounts: samples.map(
        (sample) => sample.split(/\s+/).filter(Boolean).length,
      ),
    }
  })
  return {
    documentType: structure.documentType,
    hierarchy: structure.sections.map((section) => ({
      name: section.name,
      level: section.level,
      order: section.order,
    })),
    activityPatterns: structure.activityPatterns.map((activity) => ({
      namePattern: activity.namePattern,
      sections: activity.sections,
    })),
    sections,
  }
}

export function buildWritingAnalysisPrompt(
  input: WritingAnalysisInput,
): string {
  return `Você é o analisador de padrões de escrita do SIEAR.

Analise COMO o autor escreve, não resuma O QUE aconteceu. Extraia regras linguísticas reutilizáveis por tipo de seção.
Use exclusivamente as amostras e a estrutura fornecidas. Não copie frases completas como regras.
Nomes, pessoas, datas, empresas, equipamentos, códigos e fatos particulares são dados do exemplo e jamais regras permanentes.
Não invente evidências. Toda evidência deve ser um trecho literal contido em uma das amostras e ter a seção correta.
Crie sectionStyles para exatamente todas as seções da entrada que possuem samples não vazios, uma única vez por nome. Não crie sectionStyle para seção sem samples. Quando a evidência for insuficiente para uma regra, use o array de regras vazio.
Retorne sectionStyles exatamente na mesma ordem em que as seções aparecem na entrada.
Copie sectionName exatamente da entrada. Seja conciso: use no máximo 3 evidências por perfil ou regra, 3 padrões de cada tipo por seção e 8 regras em cada lista global.
Retorne exclusivamente JSON válido, sem Markdown.

Todos os perfis de estilo devem conter:
tone, formality, technicality, objectivity, averageParagraphWords, sentenceComplexity, grammaticalPerson, verbTense, voice, firstPersonUsage, thirdPersonUsage, detailLevel, narrativeStyle, evidence.

Cada item de regra deve ter exatamente:
{"rule":"string","justification":"string","evidence":[{"sectionName":"string ou null","excerpt":"trecho literal","reason":"string"}]}

Cada sectionStyle deve conter o nome da seção, todos os campos do perfil e os arrays introductionPatterns, developmentPatterns e conclusionPatterns.

O objeto raiz deve conter exatamente:
globalStyle, sectionStyles, vocabulary, terminology, sentencePatterns, paragraphPatterns, narrativePatterns, forbiddenPatterns, recommendedPatterns.

ENTRADA ESTRUTURADA E AMOSTRAS REPRESENTATIVAS:
${JSON.stringify(input, null, 2)}`
}
