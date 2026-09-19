import type { StructurePattern } from '../../documents/structure-analysis.types'
import type { DocumentRepresentation } from '../../documents/types'
import type { WritingPattern } from '../../documents/writing-analysis.types'
import { buildWritingAnalysisInput } from './writing-analysis.prompt'

export interface SemanticAnalysisInput {
  documentType: string
  sections: Array<{
    name: string
    level: number
    order: number
    structuralPurpose: string | null
    samples: string[]
    writingStyle: {
      tone: string
      technicality: string
      narrativeStyle: string
      detailLevel: string
    } | null
  }>
  activityPatterns: Array<{
    namePattern: string
    sections: string[]
    occurrenceCount: number
  }>
  fieldCandidates: Array<{
    name: string
    label: string
    valueType: string
    evidence: Array<{ sectionName: string | null; excerpt: string }>
  }>
  narrativeRules: string[]
}

export function buildSemanticAnalysisInput(
  document: DocumentRepresentation,
  structure: StructurePattern,
  writing: WritingPattern,
): SemanticAnalysisInput {
  const writingInput = buildWritingAnalysisInput(document, structure)
  return {
    documentType: structure.documentType,
    sections: writingInput.sections.map((section) => {
      const structural = structure.sections.find(
        (item) => item.name === section.name,
      )
      const style = writing.sectionStyles.find(
        (item) => item.sectionName === section.name,
      )
      return {
        name: section.name,
        level: section.level,
        order: structural?.order ?? 0,
        structuralPurpose: section.purpose,
        samples: section.samples,
        writingStyle: style
          ? {
              tone: style.tone,
              technicality: style.technicality,
              narrativeStyle: style.narrativeStyle,
              detailLevel: style.detailLevel,
            }
          : null,
      }
    }),
    activityPatterns: structure.activityPatterns.map((activity) => ({
      namePattern: activity.namePattern,
      sections: activity.sections,
      occurrenceCount: structure.sections.filter(
        (section) =>
          section.repeatable &&
          section.name.toLocaleLowerCase('pt-BR').startsWith('atividade'),
      ).length,
    })),
    fieldCandidates: structure.fields.map((field) => ({
      name: field.name,
      label: field.label,
      valueType: field.type,
      evidence: field.evidence.map((evidence) => ({
        sectionName: (() => {
          const sectionId = document.paragraphs.find(
            (paragraph) => paragraph.id === evidence.elementId,
          )?.sectionId
          return (
            document.sections.find((section) => section.id === sectionId)
              ?.title ?? null
          )
        })(),
        excerpt: evidence.excerpt.slice(0, 300),
      })),
    })),
    narrativeRules: writing.narrativePatterns.map((pattern) => pattern.rule),
  }
}

export function buildSemanticAnalysisPrompt(
  input: SemanticAnalysisInput,
): string {
  return `Você é o analisador semântico do SIEAR.

Descubra a FUNÇÃO de cada seção com base exclusivamente na estrutura, no padrão de escrita e nas amostras fornecidas. Não resuma o documento.
Os exemplos do enunciado não são regras fixas. Infira o comportamento real deste documento.
Compare ocorrências do mesmo activityPattern como evidência de um único padrão reutilizável; não crie modelos separados por ocorrência.
Diferencie valores específicos de campos reutilizáveis. Nunca transforme nomes, datas, empresas, equipamentos, códigos ou fatos do exemplo em valores permanentes.
Não invente seções, relações, campos ou evidências. Uma evidência deve ser trecho literal das amostras ou das evidências de campo fornecidas.
Quando não houver suporte suficiente, registre a limitação em uncertainties.
Responda exclusivamente JSON válido, sem Markdown.

O objeto raiz deve conter exatamente: documentType, sections, activityPatterns, fields, crossSectionRelations, uncertainties.
Cada seção deve conter exatamente: sectionName, purpose, expectedInformation, excludedInformation, informationOrder, relationships, narrativePattern, detailLevel, evidence.
informationType deve ser um de: context, fact, action, cause, procedure, result, validation, field, other.
Cada evidência deve conter exatamente: sectionName, excerpt, reason.
Cada regra deve conter exatamente: rule, justification, evidence.

ENTRADA SEMÂNTICA ESTRUTURADA:
${JSON.stringify(input, null, 2)}`
}
