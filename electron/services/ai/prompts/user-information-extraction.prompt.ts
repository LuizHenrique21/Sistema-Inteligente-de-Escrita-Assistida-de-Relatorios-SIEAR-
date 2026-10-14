import type { ReportTemplate } from '../../../../src/domain/templates/report-template'
import { getReportUnit } from '../../../../src/domain/templates/report-unit'

export function buildUserInformationExtractionPrompt(
  text: string,
  template: ReportTemplate,
): string {
  const reportUnit = getReportUnit(template)
  const relevantTemplate = {
    documentType: template.metadata.documentType,
    fields: (reportUnit ? [] : template.fields).map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      required: field.required,
    })),
    sections: reportUnit
      ? reportUnit.sections.map((section) => ({
          name: section.name,
        }))
      : template.semanticPattern.sections.map((section) => ({
          name: section.sectionName,
          semanticPurpose: section.purpose,
          expectedInformation: section.expectedInformation,
          excludedInformation: section.excludedInformation,
        })),
    semanticFields: reportUnit ? [] : template.semanticPattern.fields,
  }
  return `Você é o UserInformationExtractor do SIEAR.

Interprete semanticamente o relato do usuário, sem apenas reescrevê-lo.
Extraia exclusivamente fatos presentes no texto. Não invente datas, equipamentos, resultados, procedimentos, problemas ou responsáveis.
O template serve somente para reconhecer possíveis tipos de informação; ele nunca é fonte de fatos.
Cada fato e atividade deve possuir evidence copiada literalmente do texto do usuário.
Não crie um fato quando não houver evidência. Use null e arrays vazios nos campos ausentes das atividades.
Responda exclusivamente JSON válido, sem Markdown.

Formato obrigatório:
{"facts":[{"name":"string","label":"string","value":"string","evidence":"trecho literal"}],"activities":[{"description":"string","procedures":["string"],"result":null,"problems":[],"evidence":["trecho literal"]}]}

TEMPLATE RELEVANTE:
${JSON.stringify(relevantTemplate, (key, value) => (key === 'evidence' ? undefined : value), 2)}

TEXTO DO USUÁRIO:
${JSON.stringify(text)}`
}
