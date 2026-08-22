import type { DocumentRepresentation } from '../../documents/types'

export interface StructureSemanticSummary {
  fileName: string
  title: string | null
  headings: Array<{ name: string; level: number; order: number }>
  sectionSamples: Array<{ name: string; sample: string }>
  fieldEvidence: Array<{ label: string; excerpt: string }>
  elementCounts: Record<string, number>
}

export function buildStructureSemanticSummary(
  document: DocumentRepresentation,
  fieldEvidence: Array<{ label: string; excerpt: string }>,
): StructureSemanticSummary {
  return {
    fileName: document.fileName,
    title: document.metadata.title,
    headings: document.headings.map((heading) => ({
      name: heading.title,
      level: heading.level,
      order: heading.order,
    })),
    sectionSamples: document.sections.map((section) => ({
      name: section.title,
      sample: section.content.slice(0, 300),
    })),
    fieldEvidence,
    elementCounts: {
      sections: document.sections.length,
      lists: document.lists.length,
      tables: document.tables.length,
      figures: document.figures.length,
      headers: document.headers.length,
      footers: document.footers.length,
    },
  }
}

export function buildStructureAnalysisPrompt(
  summary: StructureSemanticSummary,
): string {
  return `Você é um analisador semântico de estruturas documentais do SIEAR.

Receba somente o resumo estrutural fornecido. Não invente seções, campos, fatos ou evidências.
Determine apenas o tipo provável do documento e a finalidade das seções cuja semântica seja reconhecível.
Se não houver evidência suficiente, use null. Responda exclusivamente JSON, sem Markdown.

Formato obrigatório:
{"documentType":null,"sectionPurposes":[{"name":"string","purpose":null}]}

RESUMO ESTRUTURAL:
${JSON.stringify(summary, null, 2)}`
}
