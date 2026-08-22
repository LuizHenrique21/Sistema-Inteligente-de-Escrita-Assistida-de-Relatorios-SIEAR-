import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { DocumentExtractorService } from './document-extractor.service'

describe('DocumentExtractorService e TxtExtractor', () => {
  let directory: string
  const service = new DocumentExtractorService()

  beforeEach(async () => {
    directory = await mkdtemp(path.join(os.tmpdir(), 'siear-documents-'))
  })
  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('extrai TXT válido preservando títulos, ordem e campos variáveis', async () => {
    const file = path.join(directory, 'modelo.txt')
    await writeFile(
      file,
      `RELATÓRIO DE ATIVIDADE TÉCNICA

Data: 20/08/2026
Responsável: João Silva
Equipamento: Notebook Dell Latitude 5420

1. OBJETIVO
Realizar manutenção no equipamento.

2. ATIVIDADES REALIZADAS
Foi realizada a substituição do HD.

3. RESULTADOS
O equipamento apresentou funcionamento normal.`,
      'utf8',
    )

    const document = await service.extract(file)
    expect(document.fileType).toBe('txt')
    expect(document.text).toContain('João Silva')
    expect(document.sections.map((section) => section.title)).toEqual([
      'RELATÓRIO DE ATIVIDADE TÉCNICA',
      'OBJETIVO',
      'ATIVIDADES REALIZADAS',
      'RESULTADOS',
    ])
    expect(document.sections[2]?.content).toContain('substituição do HD')
  })

  it('aceita documento sem estrutura clara com seções vazias', async () => {
    const file = path.join(directory, 'livre.txt')
    await writeFile(file, 'Este é apenas um parágrafo sem títulos.', 'utf8')
    const document = await service.extract(file)
    expect(document.sections).toEqual([])
    expect(document.paragraphs).toHaveLength(1)
  })

  it('rejeita arquivo inexistente', async () => {
    await expect(
      service.extract(path.join(directory, 'ausente.docx')),
    ).rejects.toMatchObject({ code: 'FILE_NOT_FOUND' })
  })

  it('rejeita extensão não suportada', async () => {
    const file = path.join(directory, 'modelo.pdf')
    await writeFile(file, 'conteúdo', 'utf8')
    await expect(service.extract(file)).rejects.toMatchObject({
      code: 'UNSUPPORTED_FORMAT',
    })
  })

  it('rejeita documento vazio', async () => {
    const file = path.join(directory, 'vazio.txt')
    await writeFile(file, '   ', 'utf8')
    await expect(service.extract(file)).rejects.toMatchObject({
      code: 'EMPTY_DOCUMENT',
    })
  })
})
