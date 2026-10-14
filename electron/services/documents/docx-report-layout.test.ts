import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'
import { createRichReportTemplate } from '../../testing/report-template.fixture'
import { ReportGenerationPlanner } from '../reports/report-generation-planner'
import { DocumentRenderer } from './document-renderer'
import { learnDocxReportLayout } from './docx-report-layout'
import type { ExtractedSection } from './types'

const styles =
  '<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:style w:type="paragraph" w:styleId="Custom"><w:rPr><w:rFonts w:ascii="Cambria"/><w:color w:val="334455"/></w:rPr></w:style></w:styles>'
const prose =
  'Foi executada uma atividade documentada no exemplo de origem, com contexto suficiente para identificar a estrutura do texto.'
const p = (text: string, heading = false) =>
  `<w:p><w:pPr><w:pStyle w:val="Custom"/><w:jc w:val="${heading ? 'left' : 'both'}"/><w:ind w:firstLine="720"/></w:pPr><w:r><w:rPr>${heading ? '<w:b/>' : ''}<w:sz w:val="24"/></w:rPr><w:t>${text}</w:t></w:r></w:p>`

async function source(blocks: string, sections: ExtractedSection[]) {
  const xml = `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${blocks}<w:sectPr><w:pgMar w:left="1234"/></w:sectPr></w:body></w:document>`
  const zip = new JSZip()
  zip.file('word/document.xml', xml)
  zip.file('word/styles.xml', styles)
  zip.file(
    '[Content_Types].xml',
    '<Types><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  )
  zip.file(
    'word/_rels/document.xml.rels',
    '<Relationships><Relationship Id="s" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>',
  )
  return learnDocxReportLayout(zip, xml, { sections })
}

const section = (title: string, order: number): ExtractedSection => ({
  id: title,
  title,
  order,
  level: 1,
  parentSectionId: null,
  content: '',
})

describe('aprendizado de layout sem dependência do assunto', () => {
  it.each([
    ['Contexto', 'Intervenção', 'Encerramento'],
    [
      'Descrição da atividade',
      'Justificativa da atividade',
      'Resultado Obtido na atividade',
    ],
  ])('detecta sequências repetidas: %s / %s / %s', async (...labels) => {
    const instance = labels.map((label) => p(label, true) + p(prose)).join('')
    const layout = await source(instance + instance, [])
    expect(layout?.collection?.instances).toBe(2)
    expect(layout?.sections.map((item) => item.name)).toEqual(labels)
    const archive = await JSZip.loadAsync(layout!.packageBase64, {
      base64: true,
    })
    expect(
      await archive.file('word/document.xml')!.async('text'),
    ).not.toContain(prose)
    expect(await archive.file('word/styles.xml')!.async('text')).toBe(styles)
  })

  it('mantém um documento comum completo, mesmo com capítulos numerados', async () => {
    const sections = ['Capítulo 1', 'Capítulo 2', 'Capítulo 3'].map(
      (name, index) => section(name, index + 1),
    )
    const layout = await source(
      sections.map((item) => p(item.title, true) + p(prose)).join(''),
      sections,
    )
    expect(layout?.collection).toBeNull()
    expect(layout?.sections).toHaveLength(3)
  })

  it('não confunde um cabeçalho curto repetido com uma sequência de relatórios', async () => {
    const layout = await source(
      p('Observações', true) + p(prose) + p('Observações', true) + p(prose),
      [],
    )
    expect(layout).toBeUndefined()
  })

  it('reconhece seções recorrentes também quando usam títulos formais do Word', async () => {
    const labels = ['Objetivo', 'Execução', 'Conclusões']
    const instance = labels.map((label) => p(label, true) + p(prose)).join('')
    const sections = [...labels, ...labels].map((name, index) =>
      section(name, index + 1),
    )
    const layout = await source(instance + instance, sections)
    expect(layout?.collection?.instances).toBe(2)
    expect(layout?.sections.map((item) => item.name)).toEqual(labels)
  })

  it('não colapsa capítulos só porque alguns rótulos reaparecem fora de ordem', async () => {
    const sections = ['Capítulo 1', 'Capítulo 2'].map((name, index) =>
      section(name, index + 1),
    )
    const labels = ['Contexto', 'Método', 'Conclusão']
    const blocks =
      p('Capítulo 1', true) +
      labels.map((label) => p(label, true) + p(prose)).join('') +
      p('Capítulo 2', true) +
      [labels[0]!, labels[2]!, labels[1]!]
        .map((label) => p(label, true) + p(prose))
        .join('')
    const layout = await source(blocks, sections)
    expect(layout?.collection).toBeNull()
    expect(layout?.sections.map((item) => item.name)).toEqual([
      'Capítulo 1',
      'Capítulo 2',
    ])
  })

  it('gera um único relatório e exporta estilos e parágrafos sem reutilizar fatos do modelo', async () => {
    const labels = ['Contexto', 'Intervenção', 'Encerramento']
    const instance = labels.map((label) => p(label, true) + p(prose)).join('')
    const layout = (await source(instance + instance, []))!
    const template = createRichReportTemplate()
    template.formattingPattern.docxLayout = layout
    const information = {
      facts: [],
      activities: [
        {
          description: 'Ajustei a configuração.',
          procedures: [],
          result: null,
          problems: [],
          evidence: ['Ajustei a configuração.'],
        },
      ],
    }
    const plan = new ReportGenerationPlanner().plan(information, template)
    expect(plan.missing).toEqual([])
    expect(plan.sections.map((item) => item.sectionName)).toEqual(labels)
    const report = {
      id: 'report',
      templateId: template.metadata.id,
      templateName: template.metadata.name,
      createdAt: new Date().toISOString(),
      sections: plan.sections.map((item) => ({
        id: item.sectionId,
        name: item.sectionName,
        order: item.order,
        content: 'Primeiro parágrafo.\n\nSegundo parágrafo.',
      })),
    }
    const zip = await JSZip.loadAsync(
      await new DocumentRenderer().render(report, template),
    )
    const xml = await zip.file('word/document.xml')!.async('text')
    expect(xml.match(/<w:p>/g)).toHaveLength(9)
    expect(xml).toContain('w:firstLine="720"')
    expect(xml).toContain('w:left="1234"')
    expect(xml).not.toContain(prose)
    expect(await zip.file('word/styles.xml')!.async('text')).toBe(styles)
  })
})
