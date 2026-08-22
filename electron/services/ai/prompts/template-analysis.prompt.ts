import type { ExtractedDocument } from '../../documents/types'

export function buildTemplateAnalysisPrompt(
  document: ExtractedDocument,
): string {
  const analysisInput = {
    fileName: document.fileName,
    fileType: document.fileType,
    text: document.text.slice(0, 60_000),
    sections: document.sections,
    paragraphs: document.paragraphs,
    tables: document.tables,
  }

  return `Você é um analista especializado em identificar padrões de documentos técnicos e profissionais.

O objetivo NÃO é resumir o documento nem copiar seus dados específicos. Identifique um padrão reutilizável para produzir novos documentos semelhantes.

Analise estrutura, ordem, títulos, subtítulos, campos recorrentes, obrigatoriedade, tom, formalidade, estilo, terminologia, regras perceptíveis, tabelas e padrões de introdução e conclusão.

REGRA CRÍTICA: diferencie DADOS DO EXEMPLO de REGRAS DO MODELO.
Nomes de pessoas, datas, equipamentos, números e resultados específicos devem virar possíveis campos variáveis, nunca conteúdo fixo do template.
Não assuma que todo campo é obrigatório; use a estrutura e o contexto.
Não faça fine-tuning, treinamento ou aprendizado. Apenas extraia características.

Retorne exclusivamente JSON válido, sem Markdown ou explicações, com todos estes campos:
{
  "name": "string",
  "description": "string",
  "objective": "string",
  "tone": "string",
  "style": "string",
  "formality": "low | medium | high",
  "sections": [{ "name": "string", "description": "string", "required": true, "order": 1 }],
  "fields": [{ "name": "string", "label": "string", "type": "text | date | number | boolean", "required": true, "description": "string" }],
  "writingRules": ["string"],
  "recommendedVocabulary": ["string"],
  "forbiddenExpressions": ["string"]
}

DOCUMENTO EXTRAÍDO:
${JSON.stringify(analysisInput, null, 2)}`
}
