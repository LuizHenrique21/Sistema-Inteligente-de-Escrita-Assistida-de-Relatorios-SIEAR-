import type { StructurePattern } from '../../documents/structure-analysis.types'
import type { DocumentRepresentation } from '../../documents/types'

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

export function buildWritingAnalysisInput(
  document: DocumentRepresentation,
  structure: StructurePattern,
): WritingAnalysisInput {
  const sections = structure.sections.map((pattern) => {
    const source = document.sections.find(
      (section) => section.title === pattern.name,
    )
    const samples = representativeSamples(source?.content ?? '')
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
Crie estilos somente para seções presentes na entrada. Quando a evidência for insuficiente, descreva a limitação na justificativa e use arrays vazios.
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
