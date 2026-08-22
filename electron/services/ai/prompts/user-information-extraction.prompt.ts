import type { ReportTemplate } from '../../../../src/types/report-template'

export function buildUserInformationExtractionPrompt(
  text: string,
  template: ReportTemplate,
): string {
  const relevantTemplate = {
    documentType: template.documentType ?? template.name,
    fields: template.fields.map((field) => ({
      name: field.name,
      label: field.label,
      type: field.type,
      description: field.description,
    })),
    sections: template.sections.map((section) => ({
      name: section.name,
      semanticPurpose: section.semanticPurpose ?? section.description,
    })),
    semanticRules: template.semanticRules ?? [],
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
${JSON.stringify(relevantTemplate, null, 2)}

TEXTO DO USUÁRIO:
${JSON.stringify(text)}`
}
