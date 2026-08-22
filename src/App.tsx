import { useEffect, useState } from 'react'
import { ReportTemplatesPage } from './pages/ReportTemplatesPage'
import { templatesService } from './services/templates.service'
import type { ReportTemplate } from './types/report-template'
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
  const [activePage, setActivePage] = useState<'extract' | 'templates'>(
    'extract',
  )
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const selectedTemplate = templates.find(
    (template) => template.id === selectedTemplateId,
  )

  async function loadTemplates(): Promise<void> {
    const result = await templatesService.getAll()
    if (!result.success) return
    setTemplates(result.data)
    setSelectedTemplateId((current) =>
      result.data.some((template) => template.id === current)
        ? current
        : (result.data[0]?.id ?? ''),
    )
  }

  useEffect(() => {
    let isActive = true
    void templatesService.getAll().then((result) => {
      if (!isActive || !result.success) return
      setTemplates(result.data)
      setSelectedTemplateId(result.data[0]?.id ?? '')
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

    try {
      const result = await window.siear.ai.extractReportInformation({
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

  return (
    <main className="shell">
      <nav className="main-navigation" aria-label="Navegação principal">
        <button
          className={activePage === 'extract' ? 'active' : ''}
          type="button"
          onClick={() => setActivePage('extract')}
        >
          Extração
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
            <h2>Extração de informações</h2>
            <p className="section-description">
              Descreva a atividade livremente. O SIEAR extrairá somente as
              informações fornecidas.
            </p>
            <label htmlFor="report-template">Selecionar modelo</label>
            <select
              id="report-template"
              value={selectedTemplateId}
              onChange={(event) => setSelectedTemplateId(event.target.value)}
            >
              {templates.map((template) => (
                <option value={template.id} key={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
            {selectedTemplate && (
              <div className="selected-template-summary">
                <strong>{selectedTemplate.name}</strong>
                <span>{selectedTemplate.description}</span>
                <span>
                  {selectedTemplate.sections.length} seções · formalidade{' '}
                  {selectedTemplate.formality}
                </span>
              </div>
            )}
            <label htmlFor="report-description">Descrição</label>
            <textarea
              id="report-description"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Descreva a atividade realizada..."
              rows={7}
              disabled={isExtracting}
            />
            <button
              type="button"
              onClick={extractInformation}
              disabled={isExtracting || description.trim() === ''}
            >
              {isExtracting ? 'Extraindo...' : 'Extrair informações'}
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
          </section>
        </div>
      ) : (
        <ReportTemplatesPage
          templates={templates}
          selectedId={selectedTemplateId}
          onSelect={setSelectedTemplateId}
          onChanged={loadTemplates}
        />
      )}
    </main>
  )
}

export default App
