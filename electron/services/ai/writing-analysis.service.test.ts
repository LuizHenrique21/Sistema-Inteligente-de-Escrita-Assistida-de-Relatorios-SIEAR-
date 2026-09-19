import { describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { SqlitePipelineCheckpointRepository } from '../../repositories/checkpoints/sqlite-pipeline-checkpoint.repository'
import type { DocumentRepresentation } from '../documents/types'
import type { StructurePattern } from '../../../src/domain/templates'
import {
  WritingAnalysisService,
  isWritingPattern,
  type WritingAnalysisOptions,
} from './writing-analysis.service'
import { buildWritingAnalysisInput } from './prompts/writing-analysis.prompt'
import {
  createWritingContext,
  canonicalWritingName,
} from './writing/writing-context'
import { consolidateWriting } from './writing/writing-consolidator'
import {
  PROFILE_ENUMS,
  WRITING_SETTINGS,
  writingUnitSchema,
  validateUnit,
  type WritingUnitResult,
} from './writing/writing-contract'
import { InMemoryPipelineCheckpointRepository } from '../../repositories/checkpoints/in-memory-pipeline-checkpoint.repository'
import { PipelineCheckpointCoordinator } from '../templates/pipeline-checkpoint.coordinator'
import { createPipelineCheckpointCompatibility } from '../templates/pipeline-checkpoint.config'
import type { WritingGenerationOptions } from './writing/writing-generation.options'

function fixture(count = 2) {
  const sections = Array.from({ length: count }, (_, i) => ({
    id: 'random-' + i,
    title: i === 0 ? 'Descrição da Atividade:' : 'Resultado ' + i,
    level: 1,
    order: i + 1,
    content:
      'O procedimento foi executado conforme a especificação técnica.\nA equipe registrou cada etapa.',
    parentSectionId: null,
  }))
  const document: DocumentRepresentation = {
    fileName: 'modelo.docx',
    fileType: 'docx',
    text: 'CONTEÚDO INTEGRAL PRIVADO',
    metadata: {
      fileSize: 100,
      extractedAt: '2026-01-01',
      title: null,
      author: null,
      createdAt: null,
      modifiedAt: null,
    },
    elements: [],
    paragraphs: [],
    headings: [],
    lists: [],
    tables: [],
    figures: [],
    headers: [],
    footers: [],
    styles: [],
    sections,
    formatting: { defaultParagraph: {} },
    pageInformation: {
      widthPt: null,
      heightPt: null,
      orientation: 'portrait',
      margins: { topPt: null, rightPt: null, bottomPt: null, leftPt: null },
      pageBreakCount: 0,
      hasPageNumbering: false,
    },
  }
  const structure: StructurePattern = {
    documentType: 'Relatório técnico',
    mainTitle: null,
    hierarchy: [],
    activityPatterns: [],
    fields: [],
    recurringElements: [],
    optionalElements: [],
    requiredElements: [],
    sections: sections.map((s) => ({
      name: s.title,
      level: s.level,
      order: s.order,
      purpose: null,
      required: true,
      repeatable: false,
      children: [],
    })),
  }
  return {
    document,
    structure,
    context: createWritingContext(document, structure),
  }
}
function unit(sectionId?: string): WritingUnitResult {
  return {
    ...(sectionId ? { sectionId } : {}),
    profile: Object.fromEntries(
      Object.entries(PROFILE_ENUMS).map(([key, values]) => [key, values[0]]),
    ) as WritingUnitResult['profile'],
    evidenceIds: [`${sectionId ?? 'section-001'}-evidence-1`],
    rules: [],
  }
}
function responses(...values: unknown[]) {
  return {
    generateJson: vi
      .fn<
        (
          ...args: [string, Record<string, unknown>?, WritingGenerationOptions?]
        ) => Promise<string>
      >()
      .mockImplementation(async () => JSON.stringify(values.shift())),
  }
}
function normal() {
  return [unit(), unit('section-001'), unit('section-002')]
}
async function run(
  generator: ReturnType<typeof responses>,
  options: WritingAnalysisOptions = {},
) {
  const f = fixture()
  return new WritingAnalysisService(generator).analyze(
    f.document,
    f.structure,
    options,
  )
}
describe('WritingAnalysis — contexto e contratos', () => {
  it('separa global e seções e preserva evidências literais', async () => {
    const g = responses(...normal())
    const result = await run(g)
    expect(g.generateJson).toHaveBeenCalledTimes(3)
    const f = fixture()
    expect(
      isWritingPattern(
        result,
        buildWritingAnalysisInput(f.document, f.structure),
      ),
    ).toBe(true)
    expect(result.sectionStyles[0]?.sectionName).toBe(
      f.structure.sections[0]?.name,
    )
    expect(result.globalStyle.evidence[0]?.excerpt).toBe(
      f.context.sections[0]?.samples[0]?.text,
    )
    expect(JSON.stringify(g.generateJson.mock.calls)).not.toContain(
      f.document.text,
    )
    expect(g.generateJson.mock.calls[1]?.[0]).not.toContain('Resultado 1')
  })
  it('mantém IDs em extrações com UUIDs e datas diferentes', () => {
    const f = fixture()
    const a = createWritingContext(f.document, f.structure)
    f.document.sections.forEach((s) => {
      s.id = 'new-uuid'
    })
    f.document.metadata.extractedAt = 'different'
    expect(createWritingContext(f.document, f.structure)).toEqual(a)
  })
  it('normaliza caixa, acentos e pontuação sem eliminar números de atividade', () => {
    expect(canonicalWritingName('Descrição da Atividade:')).toBe(
      canonicalWritingName('descrição da atividade'),
    )
    expect(canonicalWritingName('Atividade 1')).not.toBe(
      canonicalWritingName('Atividade 2'),
    )
  })
  it('agrupa variantes conhecidas e preserva nome original', () => {
    const f = fixture()
    f.document.sections[1]!.title = 'descrição da atividade'
    f.structure.sections[1]!.name = 'descrição da atividade'
    expect(createWritingContext(f.document, f.structure).sections).toHaveLength(
      1,
    )
  })
  it('seleciona início, meio e fim e mascara dados comuns', () => {
    const f = fixture()
    f.document.sections[0]!.content =
      'Primeiro em 21/08/2026.\nSegundo.\nContato pessoa@empresa.com.\nQuarto.\nNúmero 123456789.'
    const input = buildWritingAnalysisInput(f.document, f.structure)
    expect(input.sections[0]?.samples).toHaveLength(3)
    expect(JSON.stringify(input)).toContain('[DATA]')
    expect(JSON.stringify(input)).toContain('[NÚMERO]')
    expect(JSON.stringify(input)).not.toContain('pessoa@empresa.com')
  })
  it('seleciona global diverso e limitado, incluindo seções finais', () => {
    const f = fixture(12)
    expect(f.context.globalSamples).toHaveLength(6)
    expect(new Set(f.context.globalSamples.map((s) => s.sectionId)).size).toBe(
      6,
    )
    expect(
      f.context.globalSamples.some((s) => s.sectionId === 'section-012'),
    ).toBe(true)
  })
  it('calcula média ponderada pelas amostras e não pela quantidade de seções', () => {
    const f = fixture()
    f.document.sections[0]!.content = 'um dois\ntrês quatro'
    f.document.sections[1]!.content = 'um dois três quatro cinco'
    expect(
      createWritingContext(f.document, f.structure).deterministicMetrics
        .averageParagraphWords,
    ).toBe(3)
  })
  it('preserva agrupamento de atividades repetíveis', () => {
    const f = fixture()
    f.document.sections[0]!.title = 'Atividade 1'
    f.document.sections[1]!.title = 'Atividade 2'
    f.structure.sections = [
      { ...f.structure.sections[0]!, name: 'Atividade', repeatable: true },
    ]
    expect(createWritingContext(f.document, f.structure).sections).toHaveLength(
      1,
    )
  })
})
describe('Validação e retries localizados', () => {
  it.each([
    [
      'enum',
      (v: Record<string, unknown>) => {
        ;(v.profile as Record<string, unknown>).voice = 'inventado'
      },
    ],
    [
      'campo ausente',
      (v: Record<string, unknown>) => {
        delete v.profile
      },
    ],
    [
      'campo desconhecido',
      (v: Record<string, unknown>) => {
        v.extra = 1
      },
    ],
    [
      'evidência',
      (v: Record<string, unknown>) => {
        v.evidenceIds = ['paragraph-999']
      },
    ],
    [
      'array',
      (v: Record<string, unknown>) => {
        v.rules = null
      },
    ],
    [
      'regra',
      (v: Record<string, unknown>) => {
        v.rules = [
          {
            kind: 'vocabulary',
            rule: '',
            justification: 'x',
            evidenceIds: ['section-001-evidence-1'],
          },
        ]
      },
    ],
  ])('corrige global inválido: %s', async (_, mutate) => {
    const bad = structuredClone(unit()) as unknown as Record<string, unknown>
    mutate(bad)
    const g = responses(bad, ...normal())
    await run(g)
    expect(g.generateJson).toHaveBeenCalledTimes(4)
    expect(g.generateJson.mock.calls[1]?.[0]).toContain('ERROS:')
    expect(g.generateJson.mock.calls[1]?.[0]).not.toContain(
      'O procedimento foi executado',
    )
  })
  it.each([
    [
      'sectionId',
      (v: Record<string, unknown>) => {
        v.sectionId = 'section-999'
      },
    ],
    [
      'enum',
      (v: Record<string, unknown>) => {
        ;(v.profile as Record<string, unknown>).voice = 'invalid'
      },
    ],
    [
      'evidência de outra seção',
      (v: Record<string, unknown>) => {
        v.evidenceIds = ['section-001-evidence-1']
      },
    ],
    [
      'regra',
      (v: Record<string, unknown>) => {
        v.rules = [{}]
      },
    ],
    [
      'objeto ausente',
      (v: Record<string, unknown>) => {
        delete v.profile
      },
    ],
    [
      'campo desconhecido aninhado',
      (v: Record<string, unknown>) => {
        ;(v.profile as Record<string, unknown>).extra = 'x'
      },
    ],
  ])('repete somente a seção inválida: %s', async (_, mutate) => {
    const bad = structuredClone(unit('section-002')) as unknown as Record<
      string,
      unknown
    >
    mutate(bad)
    const g = responses(unit(), unit('section-001'), bad, unit('section-002'))
    await run(g)
    expect(g.generateJson).toHaveBeenCalledTimes(4)
    expect(g.generateJson.mock.calls[3]?.[0]).toContain('section-002')
  })
  it('normaliza apenas classificação vazia, preservando restante', async () => {
    const bad = unit()
    ;(bad.profile as Record<string, unknown>).tone = ' '
    expect(
      (await run(responses(bad, unit('section-001'), unit('section-002'))))
        .globalStyle.tone,
    ).toBe('não identificado')
  })
  it('rejeita tipo incorreto em classificação sem converter para desconhecido', async () => {
    const bad = unit()
    ;(bad.profile as Record<string, unknown>).tone = null
    await expect(run(responses(bad, bad, bad))).rejects.toMatchObject({
      internalCode: 'WRITING_ANALYSIS_RETRY_EXHAUSTED',
    })
  })
  it('limita retries e não inicia seções quando global falha', async () => {
    const g = responses({}, {}, {})
    await expect(run(g)).rejects.toMatchObject({
      code: 'INVALID_WRITING_ANALYSIS',
      internalCode: 'WRITING_ANALYSIS_RETRY_EXHAUSTED',
    })
    expect(g.generateJson).toHaveBeenCalledTimes(3)
  })
  it('permite zero retries', async () => {
    const f = fixture(),
      g = responses({})
    await expect(
      new WritingAnalysisService(g, { maxRetries: 0 }).analyze(
        f.document,
        f.structure,
      ),
    ).rejects.toThrow()
    expect(g.generateJson).toHaveBeenCalledOnce()
  })
  it('corrige JSON malformado sem expor texto no diagnóstico', async () => {
    const g = responses(...normal())
    g.generateJson.mockResolvedValueOnce('PRIVATE invalid JSON')
    await run(g)
    expect(g.generateJson.mock.calls[1]?.[0]).toContain('INVALID_JSON')
    expect(g.generateJson.mock.calls[1]?.[0]).not.toContain('PRIVATE')
  })
  it('não repete falha de transporte', async () => {
    const g = responses()
    g.generateJson.mockRejectedValue(new Error('transport'))
    await expect(run(g)).rejects.toThrow('transport')
    expect(g.generateJson).toHaveBeenCalledOnce()
  })
  it('rejeita resposta acima do limite', async () => {
    const g = responses(...normal())
    g.generateJson.mockResolvedValueOnce(
      'x'.repeat(WRITING_SETTINGS.maxResponseCharacters + 1),
    )
    await run(g)
    expect(g.generateJson.mock.calls[1]?.[0]).toContain('RESPONSE_TOO_LARGE')
  })
  it('valida global somente contra evidências enviadas', async () => {
    const f = fixture(10),
      g = responses(unit())
    const absent = f.context.sections.find(
      (s) =>
        !f.context.globalSamples.some(
          (sample) => sample.sectionId === s.sectionId,
        ),
    )!
    const bad = {
      ...unit(),
      evidenceIds: absent.allowedEvidenceIds.slice(0, 1),
    }
    g.generateJson.mockResolvedValue(JSON.stringify(bad))
    await expect(
      new WritingAnalysisService(g).analyze(f.document, f.structure),
    ).rejects.toThrow()
  })
  it('cancela antes da próxima seção', async () => {
    const controller = new AbortController(),
      g = responses(...normal())
    await expect(
      run(g, {
        signal: controller.signal,
        onAttempt: () => controller.abort(),
      }),
    ).rejects.toMatchObject({ internalCode: 'WRITING_ANALYSIS_CANCELLED' })
    expect(g.generateJson).toHaveBeenCalledOnce()
  })
  it('não inicia chamada se já cancelada', async () => {
    const g = responses(...normal())
    await expect(run(g, { signal: AbortSignal.abort() })).rejects.toMatchObject(
      { internalCode: 'WRITING_ANALYSIS_CANCELLED' },
    )
    expect(g.generateJson).not.toHaveBeenCalled()
  })
  it('progresso e métricas seguras, limites separados', async () => {
    const onAttempt = vi.fn(),
      onProgress = vi.fn(),
      g = responses(...normal())
    await run(g, { onAttempt, onProgress })
    expect(g.generateJson.mock.calls[0]?.[2]).toMatchObject({
      numPredict: 1536,
      temperature: 0,
      think: false,
    })
    expect(g.generateJson.mock.calls[1]?.[2]).toMatchObject({
      numPredict: 1024,
    })
    expect(onProgress).toHaveBeenCalledWith('Analisando seção 1/2...')
    expect(onProgress).toHaveBeenCalledWith('Consolidando padrão de escrita...')
    expect(JSON.stringify(onAttempt.mock.calls)).not.toContain('procedimento')
  })
})
describe('Consolidação e retomada', () => {
  it('validação final aceita variações de caixa e espaços em evidência literal', async () => {
    const f = fixture(),
      out = await run(responses(...normal()))
    out.sectionStyles[0]!.sectionName =
      out.sectionStyles[0]!.sectionName.toLowerCase()
    out.sectionStyles[0]!.evidence[0]!.excerpt =
      out.sectionStyles[0]!.evidence[0]!.excerpt.replace(' ', '   ')
    expect(
      isWritingPattern(out, buildWritingAnalysisInput(f.document, f.structure)),
    ).toBe(true)
  })
  it('preserva títulos numerados sem solicitar nomes ao modelo', async () => {
    const f = fixture()
    f.document.sections[0]!.title = '1. Descrição da Atividade:'
    f.structure.sections[0]!.name = '1. Descrição da Atividade:'
    const out = await new WritingAnalysisService(
      responses(...normal()),
    ).analyze(f.document, f.structure)
    expect(out.sectionStyles[0]?.sectionName).toBe('1. Descrição da Atividade:')
  })
  it('retoma unidades após fechar e reabrir o SQLite', async () => {
    const directory = mkdtempSync(path.join(tmpdir(), 'siear-writing-test-'))
    const databasePath = path.join(directory, 'writing.sqlite3')
    let repository = new SqlitePipelineCheckpointRepository(databasePath)
    const f = fixture(3)
    const options = () => ({
      checkpoints: {
        coordinator: new PipelineCheckpointCoordinator(
          repository,
          createPipelineCheckpointCompatibility('qwen3:8b'),
        ),
        documentHash: 'file-hash',
      },
    })
    try {
      await expect(
        new WritingAnalysisService(
          responses(
            unit(),
            unit('section-001'),
            unit('section-002'),
            {},
            {},
            {},
          ),
        ).analyze(f.document, f.structure, options()),
      ).rejects.toThrow()
      repository.close()
      repository = new SqlitePipelineCheckpointRepository(databasePath)
      const remaining = responses(unit('section-003'))
      await new WritingAnalysisService(remaining).analyze(
        f.document,
        f.structure,
        options(),
      )
      expect(remaining.generateJson).toHaveBeenCalledOnce()
    } finally {
      repository.close()
      rmSync(directory, { recursive: true, force: true })
    }
  })
  it('preserva global, diferenças, evidências e ordem de quatro seções', () => {
    const f = fixture(4),
      global = unit()
    global.profile.voice = 'mista'
    global.rules = [
      {
        kind: 'vocabulary',
        rule: 'Usar termos técnicos.',
        justification: 'Termos presentes na amostra.',
        evidenceIds: global.evidenceIds,
      },
    ]
    const units = f.context.sections.map((s) => unit(s.sectionId))
    units[2]!.profile.voice = 'impessoal'
    const out = consolidateWriting(f.context, global, units.reverse())
    expect(out.globalStyle.voice).toBe('mista')
    expect(out.sectionStyles[2]?.voice).toBe('impessoal')
    expect(out.sectionStyles.map((s) => s.sectionName)).toEqual(
      f.context.sections.map((s) => s.originalName),
    )
    expect(out.vocabulary[0]?.evidence[0]?.excerpt).toBe(
      f.context.sections[0]?.samples[0]?.text,
    )
    expect(
      out.sectionStyles.every((s) => s.developmentPatterns.length === 0),
    ).toBe(true)
  })
  it('rejeita seção perdida e duplicada na consolidação', () => {
    const f = fixture()
    expect(() =>
      consolidateWriting(f.context, unit(), [unit('section-001')]),
    ).toThrow()
    expect(() =>
      consolidateWriting(f.context, unit(), [
        unit('section-001'),
        unit('section-001'),
      ]),
    ).toThrow()
  })
  it('rejeita checkpoint final superficial, evidência inventada e campos desconhecidos', async () => {
    const f = fixture(),
      input = buildWritingAnalysisInput(f.document, f.structure)
    expect(
      isWritingPattern({ globalStyle: {}, sectionStyles: [] }, input),
    ).toBe(false)
    const out = await run(responses(...normal()))
    out.globalStyle.evidence[0]!.excerpt = 'inventado'
    expect(isWritingPattern(out, input)).toBe(false)
  })
  it('reutiliza global e seções válidas depois de falhar seção 3', async () => {
    const f = fixture(3),
      repository = new InMemoryPipelineCheckpointRepository()
    const save = vi.spyOn(repository, 'save')
    const options = {
      checkpoints: {
        coordinator: new PipelineCheckpointCoordinator(
          repository,
          createPipelineCheckpointCompatibility('qwen3:8b'),
        ),
        documentHash: 'doc-hash',
      },
    }
    const first = responses(
      unit(),
      unit('section-001'),
      unit('section-002'),
      {},
      {},
      {},
    )
    await expect(
      new WritingAnalysisService(first).analyze(
        f.document,
        f.structure,
        options,
      ),
    ).rejects.toThrow()
    const second = responses(unit('section-003'))
    await new WritingAnalysisService(second).analyze(
      f.document,
      f.structure,
      options,
    )
    expect(second.generateJson).toHaveBeenCalledOnce()
    expect(second.generateJson.mock.calls[0]?.[0]).toContain('section-003')
    expect(JSON.stringify(save.mock.calls)).not.toContain('O procedimento')
    expect(JSON.stringify(save.mock.calls)).not.toContain('samples')
    const third = responses()
    await new WritingAnalysisService(third).analyze(
      f.document,
      f.structure,
      options,
    )
    expect(third.generateJson).not.toHaveBeenCalled()
  })
  it('invalida unidades quando modelo muda', async () => {
    const f = fixture(),
      repository = new InMemoryPipelineCheckpointRepository()
    for (const model of ['model-a', 'model-b']) {
      const g = responses(...normal())
      await new WritingAnalysisService(g).analyze(f.document, f.structure, {
        checkpoints: {
          coordinator: new PipelineCheckpointCoordinator(
            repository,
            createPipelineCheckpointCompatibility(model),
          ),
          documentHash: 'hash',
        },
      })
      expect(g.generateJson).toHaveBeenCalledTimes(3)
    }
  })
  it('enum, schema e validador compartilham a mesma fonte', () => {
    const schema = writingUnitSchema(['section-001-evidence-1'])
    for (const voice of PROFILE_ENUMS.voice) {
      const value = unit()
      value.profile.voice = voice
      expect(validateUnit(value, schema)).toEqual([])
    }
    expect(validateUnit({ ...unit(), evidenceIds: [] }, schema)).toContainEqual(
      expect.objectContaining({ code: 'INVALID_ARRAY_LENGTH' }),
    )
  })
})
