import { describe, expect, it } from 'vitest'
import { validAnalysis } from '../ai/template-analysis.service.test'
import { TemplateMapper } from './template.mapper'

describe('TemplateMapper', () => {
  it('converte análise em ReportTemplate editável sem fixar dados do exemplo', () => {
    const template = new TemplateMapper().toReportTemplate(validAnalysis)
    expect(template.id).toBeTruthy()
    expect(template.sections[0]).toMatchObject({ name: 'Objetivo', order: 1 })
    expect(template.fields.map((field) => field.name)).toEqual([
      'Data',
      'Responsável',
      'Equipamento',
    ])
    expect(JSON.stringify(template)).not.toContain('João Silva')
    expect(JSON.stringify(template)).not.toContain('Notebook Dell')
  })
})
