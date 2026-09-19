import { describe, expect, it, vi } from 'vitest'
import type { ReportTemplate } from '../../../src/types/report-template'
import type { FormattingPattern } from '../documents/formatting-analysis.types'
import type { SemanticPattern } from '../documents/semantic-analysis.types'
import type { StructurePattern } from '../documents/structure-analysis.types'
import type { DocumentRepresentation } from '../documents/types'
import type { WritingPattern } from '../documents/writing-analysis.types'
import { TemplateCreationPipeline } from './template-creation.pipeline'

const document = { fileName: 'modelo.docx' } as DocumentRepresentation
const structure = { documentType: 'Relatório' } as StructurePattern
const writing = { globalStyle: { tone: 'formal' } } as WritingPattern
const semantic = { documentType: 'Relatório' } as SemanticPattern
const formatting = { documentStyle: {} } as FormattingPattern

function template(id: string): ReportTemplate {
  return {
    id,
    name: 'Modelo',
    description: 'Modelo aprendido.',
    objective: 'Registrar atividades.',
    tone: 'formal',
    style: 'técnico',
    formality: 'high',
    sections: [
      {
        id: 'section',
        name: 'Descrição',
        description: 'Descrever.',
        required: true,
        order: 1,
      },
    ],
    fields: [],
    writingRules: [],
    recommendedVocabulary: [],
    forbiddenExpressions: [],
    status: 'draft',
  }
}

describe('TemplateCreationPipeline', () => {
  it('executa todas as análises na ordem e publica as sete etapas', async () => {
    const calls: string[] = []
    const extractor = {
      extract: vi.fn(async () => {
        calls.push('extract')
        return document
      }),
    }
    const structureAnalyzer = {
      analyze: vi.fn(async () => {
        calls.push('structure')
        return structure
      }),
    }
    const writingAnalyzer = {
      analyze: vi.fn(async () => {
        calls.push('writing')
        return writing
      }),
    }
    const semanticAnalyzer = {
      analyze: vi.fn(async () => {
        calls.push('semantic')
        return semantic
      }),
    }
    const formattingAnalyzer = {
      analyze: vi.fn(() => {
        calls.push('formatting')
        return formatting
      }),
    }
    const builder = {
      build: vi.fn(() => {
        calls.push('builder')
        return template('template-1')
      }),
    }
    const progress: Array<{ step: number; message: string }> = []
    const result = await new TemplateCreationPipeline(
      extractor,
      structureAnalyzer,
      writingAnalyzer,
      semanticAnalyzer,
      formattingAnalyzer,
      builder,
    ).execute('C:\\documentos\\modelo.docx', (item) => progress.push(item))

    expect(result.id).toBe('template-1')
    expect(calls).toEqual([
      'extract',
      'structure',
      'writing',
      'semantic',
      'formatting',
      'builder',
    ])
    expect(progress.map((item) => item.step)).toEqual([1, 2, 3, 4, 5, 6, 7])
    expect(progress.map((item) => item.message)).toEqual([
      'Lendo documento...',
      'Analisando estrutura...',
      'Analisando padrão de escrita...',
      'Analisando significado das seções...',
      'Analisando formatação...',
      'Construindo modelo...',
      'Modelo pronto para revisão.',
    ])
    expect(writingAnalyzer.analyze).toHaveBeenCalledWith(document, structure)
    expect(semanticAnalyzer.analyze).toHaveBeenCalledWith(
      document,
      structure,
      writing,
    )
    expect(builder.build).toHaveBeenCalledWith({
      document,
      structure,
      writing,
      semantic,
      formatting,
    })
  })

  it('interrompe o pipeline no erro e não publica progresso posterior', async () => {
    const error = new Error('DOCX inválido')
    const progress: number[] = []
    const pipeline = new TemplateCreationPipeline(
      { extract: vi.fn().mockRejectedValue(error) },
      { analyze: vi.fn() },
      { analyze: vi.fn() },
      { analyze: vi.fn() },
      { analyze: vi.fn() },
      { build: vi.fn() },
    )
    await expect(
      pipeline.execute('invalido.docx', (item) => progress.push(item.step)),
    ).rejects.toBe(error)
    expect(progress).toEqual([1])
  })

  it('cada execução constrói um modelo independente', async () => {
    let sequence = 0
    const builder = {
      build: vi.fn(() => template(`template-${++sequence}`)),
    }
    const pipeline = new TemplateCreationPipeline(
      { extract: vi.fn().mockResolvedValue(document) },
      { analyze: vi.fn().mockResolvedValue(structure) },
      { analyze: vi.fn().mockResolvedValue(writing) },
      { analyze: vi.fn().mockResolvedValue(semantic) },
      { analyze: vi.fn().mockReturnValue(formatting) },
      builder,
    )
    const first = await pipeline.execute('primeiro.docx')
    const second = await pipeline.execute('segundo.docx')
    expect(first.id).not.toBe(second.id)
    expect(builder.build).toHaveBeenCalledTimes(2)
  })
})
