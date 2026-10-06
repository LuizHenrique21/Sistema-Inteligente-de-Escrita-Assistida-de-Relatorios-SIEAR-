import type { PlannedReportSection, StructuredActivity } from '../../../../src/types/generated-report'
import type { ReportTemplate } from '../../../../src/domain/templates/report-template'

export interface ReportGenerationEvidence {
  id: string
  text: string
}

function withoutEvidence<T>(value: T): T {
  return JSON.parse(
    JSON.stringify(value, (key, item) => (key === 'evidence' ? undefined : item)),
  ) as T
}

function sectionContext(
  information: StructuredActivity,
  section: PlannedReportSection,
  template: ReportTemplate,
  evidence: ReportGenerationEvidence[],
): unknown {
  const indexedActivities = section.activityIndexes
    .map((index) => information.activities[index])
    .filter((activity): activity is NonNullable<typeof activity> => activity !== undefined)
  return {
    template: {
      name: template.metadata.name,
      documentType: template.metadata.documentType,
    },
    section: {
      sectionId: section.sectionId,
      name: section.sectionName,
      purpose: section.purpose,
      required: section.required,
      repeatable: section.repeatable,
      expectedInformation: section.semantics?.expectedInformation.map(
        (item) => ({
          name: item.name,
          description: item.description,
          informationType: item.informationType,
        }),
      ) ?? [],
      excludedInformation: section.semantics?.excludedInformation.map(
        (item) => item.rule,
      ) ?? [],
      writingStyle: withoutEvidence(
        section.writingStyle ?? template.writingPattern.globalStyle,
      ),
    },
    facts: information.facts,
    activities:
      indexedActivities.length > 0 ? indexedActivities : information.activities,
    allowedEvidence: evidence,
  }
}

export function buildReportSectionGenerationPrompt(
  information: StructuredActivity,
  section: PlannedReportSection,
  template: ReportTemplate,
  evidence: ReportGenerationEvidence[],
): string {
  return `Você redige UMA seção de relatório no SIEAR.
Escreva somente a seção fornecida. Não crie, remova, renomeie ou misture seções.
Os fatos vêm exclusivamente de FACTS e ACTIVITIES. O modelo de relatório só define estrutura e estilo, nunca fatos.
Não invente datas, responsáveis, equipamentos, resultados, números, procedimentos ou problemas.
Selecione usedEvidenceIds exclusivamente da lista allowedEvidence. Eles devem sustentar o conteúdo.
Se os fatos não sustentarem um detalhe, omita o detalhe. Não escreva que uma informação está ausente.
Retorne somente JSON válido, sem Markdown.

FORMATO:
{"sectionId":"id exato","name":"nome exato","content":"texto da seção","usedEvidenceIds":["evidence-001"]}

CONTEXTO DA SEÇÃO:
${JSON.stringify(sectionContext(information, section, template, evidence))}`
}
