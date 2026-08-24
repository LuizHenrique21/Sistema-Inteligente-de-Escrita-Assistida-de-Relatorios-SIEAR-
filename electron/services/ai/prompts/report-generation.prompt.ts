import type { ReportTemplate } from '../../../../src/domain/templates/report-template'
import type {
  ReportGenerationPlan,
  StructuredActivity,
} from '../../../../src/types/generated-report'

export function buildReportGenerationPrompt(
  information: StructuredActivity,
  plan: ReportGenerationPlan,
  template: ReportTemplate,
): string {
  const writingAndSemanticPlan = {
    template: {
      name: template.metadata.name,
      documentType: template.metadata.documentType,
    },
    groundingPolicy: plan.groundingPolicy,
    sections: plan.sections.map((section) => ({
      sectionId: section.sectionId,
      name: section.sectionName,
      order: section.order,
      level: section.level,
      parentSectionId: section.parentSectionId,
      required: section.required,
      repeatable: section.repeatable,
      purpose: section.purpose,
      factNames: section.factNames,
      activityIndexes: section.activityIndexes,
      writingStyle: section.writingStyle,
      semantics: section.semantics,
    })),
    globalWritingStyle: plan.templateContext.writingPattern,
    activityPatterns: plan.templateContext.activityPatterns,
    fields: plan.templateContext.fields,
    requirements: plan.templateContext.requirements,
    semanticRelations: plan.templateContext.crossSectionRelations,
    semanticUncertainties: plan.templateContext.semanticPattern.uncertainties,
  }

  return `Você é o redator estruturado de relatórios do SIEAR.

O plano já determinou a estrutura. Você deve somente preencher o conteúdo das seções do plano, mantendo seus identificadores e sua ordem.
StructuredActivity é a única fonte de fatos. O template define exclusivamente COMO escrever e nunca é fonte do que aconteceu.
É proibido inventar ou inferir datas, equipamentos, resultados, problemas, procedimentos, responsáveis, números ou qualquer outro fato sem evidência.
Respeite pessoa, tempo verbal, voz, formalidade, regras, vocabulário, terminologia, padrão narrativo, informações esperadas e excluídas e relações semânticas.
Não resolva incertezas sem evidência. Não crie, remova, renomeie, reordene ou reorganize seções.
Cada afirmação factual deve estar apoiada por usedEvidence copiada literalmente de StructuredActivity.
Retorne exclusivamente JSON válido, sem Markdown.

Formato: {"sections":[{"sectionId":"identificador exato do plano","name":"nome exato","content":"texto","usedEvidence":["trecho literal"]}]}

PLANO DE REDAÇÃO E SEMÂNTICA:
${JSON.stringify(writingAndSemanticPlan, (key, value) => (key === 'evidence' ? undefined : value), 2)}

STRUCTURED ACTIVITY:
${JSON.stringify(information, null, 2)}`
}
