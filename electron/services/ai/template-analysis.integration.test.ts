import { expect, it } from 'vitest'
import type { ExtractedDocument } from '../documents/types'
import { OllamaService } from '../ollama/ollama.service'
import { TemplateAnalysisService } from './template-analysis.service'

const integrationTest =
  process.env.SIEAR_OLLAMA_INTEGRATION === 'true' ? it : it.skip

integrationTest(
  'identifica estrutura e campos variáveis usando o Ollama local',
  async () => {
    const document: ExtractedDocument = {
      fileName: 'relatorio-tecnico.txt',
      fileType: 'txt',
      text: 'Data: 20/08/2026\nResponsável: João Silva\nEquipamento: Notebook Dell Latitude 5420\n1. OBJETIVO\nRealizar manutenção.\n2. ATIVIDADES REALIZADAS\nSubstituição do HD.\n3. RESULTADOS\nFuncionamento normal.\n4. CONCLUSÃO\nManutenção concluída.',
      sections: [
        {
          id: '1',
          title: 'OBJETIVO',
          level: 1,
          order: 1,
          content: 'Realizar manutenção.',
          parentSectionId: null,
        },
        {
          id: '2',
          title: 'ATIVIDADES REALIZADAS',
          level: 1,
          order: 2,
          content: 'Substituição do HD.',
          parentSectionId: null,
        },
        {
          id: '3',
          title: 'RESULTADOS',
          level: 1,
          order: 3,
          content: 'Funcionamento normal.',
          parentSectionId: null,
        },
        {
          id: '4',
          title: 'CONCLUSÃO',
          level: 1,
          order: 4,
          content: 'Manutenção concluída.',
          parentSectionId: null,
        },
      ],
      paragraphs: [],
      elements: [],
      headings: [],
      lists: [],
      tables: [],
      figures: [],
      headers: [],
      footers: [],
      pageInformation: {
        widthPt: null,
        heightPt: null,
        orientation: null,
        margins: { topPt: null, rightPt: null, bottomPt: null, leftPt: null },
        pageBreakCount: 0,
        hasPageNumbering: false,
      },
      formatting: { defaultParagraph: {} },
      styles: [],
      metadata: {
        fileSize: 300,
        extractedAt: new Date().toISOString(),
        title: null,
        author: null,
        createdAt: null,
        modifiedAt: null,
      },
    }

    const analysis = await new TemplateAnalysisService(
      new OllamaService(),
    ).analyze(document)
    const fieldNames = analysis.fields
      .map((field) => `${field.name} ${field.label}`.toLocaleLowerCase('pt-BR'))
      .join(' ')
    expect(fieldNames).toContain('data')
    expect(fieldNames).toContain('respons')
    expect(fieldNames).toContain('equipamento')
    expect(JSON.stringify(analysis)).not.toContain('João Silva')
    expect(JSON.stringify(analysis)).not.toContain('Dell Latitude 5420')
    expect(analysis.sections.map((section) => section.order)).toEqual(
      [...analysis.sections]
        .map((section) => section.order)
        .sort((a, b) => a - b),
    )
  },
  180_000,
)
