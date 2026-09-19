import { useEffect, useState } from 'react'
import { ReportTemplatesPage } from './pages/ReportTemplatesPage'
import { aiService } from './services/ai.service'
import { templatesService } from './services/templates.service'
import type {
  GeneratedReport,
  MissingRequiredInformation,
} from './types/generated-report'
import type { ReportTemplate } from './domain/templates/report-template'
import type { AppInfo, ReportInformation } from './types/siear-api'

const EXAMPLE_DESCRIPTION =
  'Troquei o HD do notebook Dell, instalei Windows 11 e atualizei os drivers. Depois fiz testes e o computador funcionou normalmente.'

function displayValue(value: string | null): string {
  return value ?? 'Não informado'
}

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [status, setStatus] = useState('Pronto para testar')
  const [isCheckingApp, setIsCheckingApp] = useState(false)
  const [description, setDescription] = useState(EXAMPLE_DESCRIPTION)
  const [report, setReport] = useState<ReportInformation | null>(null)
  const [extractionError, setExtractionError] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [generatedReport, setGeneratedReport] =
    useState<GeneratedReport | null>(null)
  const [generationError, setGenerationError] = useState('')
  const [missingInformation, setMissingInformation] = useState<
    MissingRequiredInformation[]
  >([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')
  const [activePage, setActivePage] = useState<'extract' | 'templates'>(
    'extract',
  )
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const selectedTemplate = templates.find(
    (template) => template.metadata.id === selectedTemplateId,
  )

  useEffect(() => {
    let isActive = true
    void templatesService.getAll().then((result) => {
      if (!isActive || !result.success) return
      setTemplates(result.data)
      setSelectedTemplateId(result.data[0]?.metadata.id ?? '')
    })
    return () => {
      isActive = false
    }
  }, [])

  async function testConnection(): Promise<void> {
    setIsCheckingApp(true)
    setStatus('Comunicando com o Electron...')
    try {
      setInfo(await window.siear.app.getInfo())
      setStatus('Comunicação funcionando')
    } catch {
      setStatus('Não foi possível comunicar com o Electron')
    } finally {
      setIsCheckingApp(false)
    }
  }

  async function extractInformation(): Promise<void> {
    if (isExtracting) return

    const normalizedDescription = description.trim()
    if (!normalizedDescription) {
      setExtractionError(
        'Digite uma descrição antes de extrair as informações.',
      )
      return
    }

    setIsExtracting(true)
    setExtractionError('')
    setReport(null)
    setGeneratedReport(null)
    setGenerationError('')

    try {
      const result = await aiService.extractReportInformation({
        text: normalizedDescription,
      })

      if (result.success) setReport(result.data)
      else setExtractionError(result.error.message)
    } catch {
      setExtractionError('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function generateReport(): Promise<void> {
    if (!description.trim() || !selectedTemplateId || isGenerating) return
    setIsGenerating(true)
    setGenerationError('')
    setGeneratedReport(null)
    setExportMessage('')
    setMissingInformation([])

    try {
      const result = await aiService.generateReport({
        text: description.trim(),
        templateId: selectedTemplateId,
      })
      if (result.success && 'requiresInput' in result) {
        setMissingInformation(result.missing)
      } else if (result.success) setGeneratedReport(result.data)
      else setGenerationError(result.error.message)
    } catch {
      setGenerationError('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsGenerating(false)
    }
  }

  async function exportReport(): Promise<void> {
    if (!generatedReport || isExporting) return
    setIsExporting(true)
    setExportMessage('')
    try {
      const result = await aiService.exportReportDocx({
        report: generatedReport,
      })
      setExportMessage(
        result.success
          ? `Relatório exportado para ${result.filePath}`
          : result.error.message,
      )
    } catch {
      setExportMessage('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsExporting(false)
    }
  }

  return (
    <main className="shell">
      <nav className="main-navigation" aria-label="Navegação principal">
        <button
          className={activePage === 'extract' ? 'active' : ''}
          type="button"
          onClick={() => setActivePage('extract')}
        >
          Novo Relatório
        </button>
        <button
          className={activePage === 'templates' ? 'active' : ''}
          type="button"
          onClick={() => setActivePage('templates')}
        >
          Modelos de Relatório
        </button>
      </nav>
      {activePage === 'extract' ? (
        <div className="layout">
          <section className="card app-card">
            <span className="eyebrow">Escrita assistida local</span>
            <h1>SIEAR</h1>
            <p className="subtitle">
              Sistema Inteligente de Escrita Assistida de Relatórios
            </p>
            <dl className="details">
              <div>
                <dt>Versão</dt>
                <dd>{info?.version ?? '0.1.0'}</dd>
              </div>
              <div>
                <dt>Status</dt>
                <dd className="status">
                  <span aria-hidden="true" />
                  {status}
                </dd>
              </div>
              {info && (
                <div>
                  <dt>Ambiente</dt>
                  <dd>{info.environment}</dd>
                </div>
              )}
            </dl>
            <button
              type="button"
              onClick={testConnection}
              disabled={isCheckingApp}
            >
              {isCheckingApp
                ? 'Testando...'
                : 'Testar comunicação com Electron'}
            </button>
          </section>

          <section className="card extraction-card">
            <span className="eyebrow">Dados estruturados</span>
            <h2>Novo Relatório</h2>
            <p className="section-description">
              Descreva a atividade livremente. O SIEAR extrairá somente as
              informações fornecidas.
            </p>
            <label htmlFor="report-template">Selecionar modelo</label>
            <select
              id="report-template"
              value={selectedTemplateId}
              onChange={(event) => {
                setSelectedTemplateId(event.target.value)
                setGeneratedReport(null)
                setGenerationError('')
                setMissingInformation([])
              }}
            >
              {templates.map((template) => (
                <option value={template.metadata.id} key={template.metadata.id}>
                  {template.metadata.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="selected-template-summary">
                <strong>{selectedTemplate.metadata.name}</strong>
                <span>{selectedTemplate.metadata.description}</span>
                <span>
                  {selectedTemplate.structurePattern.sections.length} seções ·
                  formalidade{' '}
                  {selectedTemplate.writingPattern.globalStyle.formality}
                </span>
              </div>
            )}
            <label htmlFor="report-description">Descrição</label>
            <textarea
              id="report-description"
              value={description}
              onChange={(event) => {
                setDescription(event.target.value)
                setReport(null)
                setGeneratedReport(null)
                setExtractionError('')
                setGenerationError('')
                setMissingInformation([])
              }}
              placeholder="Descreva a atividade realizada..."
              rows={7}
              disabled={isExtracting}
            />
            <button
              type="button"
              onClick={extractInformation}
              disabled={isExtracting || description.trim() === ''}
            >
              {isExtracting ? 'Analisando...' : 'Analisar informações'}
            </button>
            <button
              className="generate-report-button"
              type="button"
              onClick={generateReport}
              disabled={
                isGenerating || !selectedTemplateId || description.trim() === ''
              }
            >
              {isGenerating
                ? 'Planejando e gerando...'
                : 'Gerar relatório com o modelo'}
            </button>

            {extractionError && (
              <div className="message error-message" role="alert">
                <strong>Não foi possível extrair as informações</strong>
                <p>{extractionError}</p>
              </div>
            )}

            {report && (
              <div className="report-result" aria-live="polite">
                <h3>Informações extraídas</h3>
                <dl className="report-grid">
                  <div>
                    <dt>Equipamento</dt>
                    <dd>{displayValue(report.equipment)}</dd>
                  </div>
                  <div className="activities-field">
                    <dt>Atividades</dt>
                    <dd>
                      {report.activities.length > 0 ? (
                        <ul>
                          {report.activities.map((activity) => (
                            <li key={activity}>{activity}</li>
                          ))}
                        </ul>
                      ) : (
                        'Não informado'
                      )}
                    </dd>
                  </div>
                  <div>
                    <dt>Resultado</dt>
                    <dd>{displayValue(report.result)}</dd>
                  </div>
                  <div>
                    <dt>Problemas</dt>
                    <dd>{displayValue(report.problems)}</dd>
                  </div>
                  <div>
                    <dt>Tempo</dt>
                    <dd>{displayValue(report.duration)}</dd>
                  </div>
                  <div>
                    <dt>Observações</dt>
                    <dd>{displayValue(report.observations)}</dd>
                  </div>
                </dl>
                <details>
                  <summary>Ver JSON</summary>
                  <pre>{JSON.stringify(report, null, 2)}</pre>
                </details>
              </div>
            )}

            {missingInformation.length > 0 && (
              <div className="message missing-information" role="status">
                <strong>Informações essenciais ausentes</strong>
                <p>
                  Responda às perguntas abaixo na descrição e tente novamente:
                </p>
                <ul>
                  {missingInformation.map((item) => (
                    <li key={item.fieldId}>{item.question}</li>
                  ))}
                </ul>
              </div>
            )}

            {generationError && (
              <div className="message error-message" role="alert">
                <strong>Não foi possível gerar o relatório</strong>
                <p>{generationError}</p>
              </div>
            )}

            {generatedReport && (
              <article className="generated-report" aria-live="polite">
                <header>
                  <span className="eyebrow">Relatório gerado</span>
                  <h2>{generatedReport.templateName}</h2>
                  <time dateTime={generatedReport.createdAt}>
                    {new Date(generatedReport.createdAt).toLocaleString(
                      'pt-BR',
                    )}
                  </time>
                </header>
                {[...generatedReport.sections]
                  .sort((first, second) => first.order - second.order)
                  .map((section) => (
                    <section key={section.id}>
                      <h3>
                        {section.order}. {section.name}
                      </h3>
                      <p>{section.content}</p>
                    </section>
                  ))}
                <button
                  type="button"
                  onClick={exportReport}
                  disabled={isExporting}
                >
                  {isExporting ? 'Exportando...' : 'Exportar DOCX'}
                </button>
                {exportMessage && <p role="status">{exportMessage}</p>}
              </article>
            )}
          </section>
        </div>
      ) : (
        <ReportTemplatesPage />
      )}
    </main>
  )
}

export default App
