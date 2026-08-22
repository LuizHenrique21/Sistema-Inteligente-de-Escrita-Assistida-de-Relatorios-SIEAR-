import { describe, expect, it, vi } from 'vitest'
import type { TemplateAnalysis } from '../../../src/types/template-import'
import type { ExtractedDocument } from '../documents/types'
import { buildTemplateAnalysisPrompt } from './prompts/template-analysis.prompt'
import {
  TemplateAnalysisError,
  TemplateAnalysisService,
} from './template-analysis.service'

const document: ExtractedDocument = {
  fileName: 'relatorio.txt',
  fileType: 'txt',
  text: 'Data: 20/08/2026\nResponsável: João Silva\nEquipamento: Notebook Dell',
  sections: [
    { id: '1', title: 'Objetivo', level: 1, order: 1, content: 'Manutenção.' },
  ],
  paragraphs: [],
  tables: [],
  metadata: { fileSize: 100, extractedAt: new Date().toISOString() },
}

export const validAnalysis: TemplateAnalysis = {
  name: 'Relatório Técnico',
  description: 'Modelo técnico.',
  objective: 'Documentar atividades.',
  tone: 'formal',
  style: 'technical',
  formality: 'high',
  sections: [
    {
      name: 'Objetivo',
      description: 'Objetivo variável.',
      required: true,
      order: 1,
    },
  ],
  fields: [
    {
      name: 'Data',
      label: 'Data',
      type: 'date',
      required: true,
      description: 'Data da atividade.',
    },
    {
      name: 'Responsável',
      label: 'Responsável',
      type: 'text',
      required: true,
      description: 'Responsável variável.',
    },
    {
      name: 'Equipamento',
      label: 'Equipamento',
      type: 'text',
      required: true,
      description: 'Equipamento variável.',
    },
  ],
  writingRules: ['Utilizar linguagem formal.'],
  recommendedVocabulary: ['procedimento'],
  forbiddenExpressions: [],
}

describe('TemplateAnalysisService', () => {
  it('distingue no prompt dados do exemplo de regras', () => {
    const prompt = buildTemplateAnalysisPrompt(document)
    expect(prompt).toContain('DADOS DO EXEMPLO')
    expect(prompt).toContain('campos variáveis')
    expect(prompt).toContain('João Silva')
  })

  it('valida resposta do Ollama e identifica campos variáveis', async () => {
    const generator = {
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(validAnalysis)),
    }
    const analysis = await new TemplateAnalysisService(generator).analyze(
      document,
    )
    expect(analysis.fields.map((field) => field.type)).toEqual([
      'date',
      'text',
      'text',
    ])
    expect(generator.generateJson).toHaveBeenCalledWith(
      expect.any(String),
      expect.any(Object),
    )
  })

  it('rejeita resposta não JSON', async () => {
    const service = new TemplateAnalysisService({
      generateJson: vi.fn().mockResolvedValue('texto'),
    })
    await expect(service.analyze(document)).rejects.toMatchObject({
      code: 'INVALID_TEMPLATE_ANALYSIS',
    } satisfies Partial<TemplateAnalysisError>)
  })

  it.each([
    {},
    { ...validAnalysis, name: '' },
    { ...validAnalysis, fields: [{ label: 'Sem nome' }] },
    {
      ...validAnalysis,
      sections: [
        { ...validAnalysis.sections[0], order: 1 },
        { ...validAnalysis.sections[0], order: 1 },
      ],
    },
  ])('rejeita TemplateAnalysis inválido: %o', async (value) => {
    const service = new TemplateAnalysisService({
      generateJson: vi.fn().mockResolvedValue(JSON.stringify(value)),
    })
    await expect(service.analyze(document)).rejects.toMatchObject({
      code: 'INVALID_TEMPLATE_ANALYSIS',
    })
  })
})
