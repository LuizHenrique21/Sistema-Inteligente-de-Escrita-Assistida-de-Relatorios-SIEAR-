import type {
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../../src/types/generated-report'
import type { ReportTemplate } from '../../../../src/types/report-template'

export function buildLearnedReportGenerationPrompt(
  information: StructuredActivity,
  plan: ReportGenerationPlan,
  template: ReportTemplate,
): string {
  const relevantTemplate = {
    name: template.name,
    documentType: template.documentType,
    tone: template.tone,
    style: template.style,
    formality: template.formality,
    sections: template.sections.map((section) => ({
      name: section.name,
      order: section.order,
      required: section.required,
      semanticPurpose: section.semanticPurpose,
      writingStyle: section.writingStyle,
    })),
    writingRules: template.writingRules,
    semanticRules: template.semanticRules ?? [],
    recommendedVocabulary: template.recommendedVocabulary,
    forbiddenExpressions: template.forbiddenExpressions,
  }
  return `Você é o gerador estruturado de relatórios do SIEAR.

O template define COMO escrever. StructuredActivity define exclusivamente O QUE aconteceu.
Não use o template como fonte de fatos. Não invente datas, equipamentos, resultados, problemas, procedimentos, responsáveis ou números.
Respeite estrutura, semântica, estilo, vocabulário e ordem do plano.
Não inclua uma afirmação factual sem associar ao menos uma usedEvidence literal fornecida em StructuredActivity.
Não copie a linguagem informal mecanicamente: redija conforme o padrão, preservando rigorosamente o significado.
Retorne exclusivamente JSON, sem Markdown.

Formato: {"sections":[{"name":"nome exato","content":"texto","usedEvidence":["trecho literal"]}]}

TEMPLATE APRENDIDO RELEVANTE:
${JSON.stringify(relevantTemplate, null, 2)}

PLANO:
${JSON.stringify(plan, null, 2)}

STRUCTURED ACTIVITY:
${JSON.stringify(information, null, 2)}`
}
