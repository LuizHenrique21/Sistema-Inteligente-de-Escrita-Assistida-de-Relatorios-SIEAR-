import { mkdir, writeFile, readFile } from 'node:fs/promises'
import { DatabaseSync } from 'node:sqlite'
import path from 'node:path'
import JSZip from 'jszip'
import { expect, it } from 'vitest'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { DocxExtractor } from '../documents/docx-extractor.service'
import { StructureAnalysisService } from '../documents/structure-analysis.service'
import { FormattingAnalysisService } from '../documents/formatting-analysis.service'
import { DocumentRenderer } from '../documents/document-renderer'
import { UserInformationExtractor } from '../ai/user-information-extractor'
import { ReportGenerationService } from '../ai/report-generation.service'
import { ReportGenerationPlanner } from './report-generation-planner'
import { ReportGenerationPipeline } from './report-generation.pipeline'
import { OllamaService } from '../ollama/ollama.service'

export const DRIVER_NARRATIVE =
  'Fiz uma adição de uma funcionalidade nova no sistema em que ao enviar um driver, ele faz uma comparação para ver se há algum já cadastrado no sistema e compara nome, versão, hardwareID e cria um hash SHA-256 para o executável dentro do zip, para que caso o conteúdo do exe seja diferente, ele aponte um hash diferente. Caso seja igual, ele bloqueia o upload'

it.skipIf(!process.env.SIEAR_SOURCE_DOCX)(
  'gera um relatório individual do DOCX real com Ollama e preserva estilos originais',
  async () => {
    const sourcePath = process.env.SIEAR_SOURCE_DOCX!
    const document = await new DocxExtractor().extract(sourcePath)
    const template = createRichReportTemplate('source-verification')
    template.metadata.name = 'Relatório de Atividade — Validação de drivers'
    template.structurePattern = await new StructureAnalysisService().analyze(
      document,
    )
    template.formattingPattern = new FormattingAnalysisService().analyze(
      document,
    )
    template.fields = template.structurePattern.fields
    if (process.env.SIEAR_SOURCE_DATABASE) {
      const db = new DatabaseSync(process.env.SIEAR_SOURCE_DATABASE, {
        readOnly: true,
      })
      try {
        const row = db
          .prepare(
            "SELECT writing_pattern_json, semantic_pattern_json FROM report_templates WHERE metadata_json LIKE '%Sprint%' ORDER BY updated_at DESC LIMIT 1",
          )
          .get() as
          | { writing_pattern_json: string; semantic_pattern_json: string }
          | undefined
        if (row) {
          template.writingPattern = JSON.parse(row.writing_pattern_json)
          template.semanticPattern = JSON.parse(row.semantic_pattern_json)
        }
      } finally {
        db.close()
      }
    }
    expect(
      template.formattingPattern.docxLayout?.collection?.instances,
    ).toBeGreaterThan(2)
    expect(
      template.formattingPattern.docxLayout?.sections.map(
        (section) => section.name,
      ),
    ).toEqual([
      'Descrição da atividade',
      'Justificativa da atividade',
      'Resultado Obtido na atividade',
    ])
    const ollama = new OllamaService()
    const pipeline = new ReportGenerationPipeline(
      new UserInformationExtractor(ollama),
      new ReportGenerationPlanner(),
      new ReportGenerationService(ollama),
    )
    const result = await pipeline.generate(DRIVER_NARRATIVE, template)
    expect(result.success).toBe(true)
    if (!result.success || 'requiresInput' in result)
      throw new Error(JSON.stringify(result))
    const report = result.data
    expect(report.sections).toHaveLength(3)
    const content = report.sections.map((section) => section.content).join('\n')
    expect(content).toMatch(/SHA[- ]?256/i)
    expect(content).toMatch(/hardware\s*ID/i)
    expect(content).toMatch(/bloque/i)
    expect(content).not.toMatch(/Madson|NEX-\d+|Cloudflare|discovery/i)
    const output = await new DocumentRenderer().render(report, template)
    const zip = await JSZip.loadAsync(output)
    const original = await JSZip.loadAsync(await readFile(sourcePath))
    expect(await zip.file('word/styles.xml')!.async('text')).toBe(
      await original.file('word/styles.xml')!.async('text'),
    )
    for (const name of Object.keys(zip.files).filter((name) =>
      /word\/(?:header|footer)\d+\.xml$/.test(name),
    ))
      expect(await zip.file(name)!.async('text')).toBe(
        await original.file(name)!.async('text'),
      )
    const bodyXml = await zip.file('word/document.xml')!.async('text')
    expect(bodyXml).not.toMatch(/Sprint 0|Sprint 1|Madson|NEX-352/)
    expect(bodyXml).toContain('w:val="both"')
    expect(bodyXml.match(/<w:p\b/g)!.length).toBeGreaterThan(6)
    const destination = path.resolve('benchmark-results/report-generation')
    await mkdir(destination, { recursive: true })
    await writeFile(path.join(destination, 'driver-report.docx'), output)
    await writeFile(
      path.join(destination, 'driver-report.json'),
      JSON.stringify(report, null, 2),
    )
    console.info(
      JSON.stringify({
        sections: report.sections.length,
        words: content.split(/\s+/).length,
        notices: report.notices,
        output: destination,
      }),
    )
  },
  300_000,
)
