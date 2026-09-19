import { useEffect, useState } from 'react'
import { TemplateReview } from '../components/templates/TemplateReview'
import { templatesService } from '../services/templates.service'
import type { TemplateImportProgress } from '../types/template-import'
import type { ReportTemplate } from '../domain/templates/report-template'

const TEMPLATE_PROGRESS_LABELS = [
  'Extração',
  'Estrutura',
  'Escrita',
  'Semântica',
  'Formatação',
  'Consolidação',
  'Finalização',
] as const

export function ReportTemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [draft, setDraft] = useState<ReportTemplate | null>(null)
  const [progress, setProgress] = useState<TemplateImportProgress | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)

  async function loadTemplates(preferredId?: string): Promise<void> {
    const result = await templatesService.getAll()
    if (!result.success) {
      setError(result.error.message)
      return
    }
    setTemplates(result.data)
    const selected =
      result.data.find((item) => item.metadata.id === preferredId) ??
      result.data[0] ??
      null
    setDraft(selected ? structuredClone(selected) : null)
  }

  useEffect(() => {
    let active = true
    const stopProgress = templatesService.onCreationProgress((item) => {
      if (active) setProgress(item)
    })
    void templatesService
      .getAll()
      .then((result) => {
        if (!active) return
        if (result.success) {
          setTemplates(result.data)
          setDraft(result.data[0] ? structuredClone(result.data[0]) : null)
        } else setError(result.error.message)
      })
      .catch(() => {
        if (active) setError('Não foi possível carregar os modelos.')
      })
      .finally(() => {
        if (active) setIsLoading(false)
      })
    return () => {
      active = false
      stopProgress()
    }
  }, [])

  async function selectTemplate(id: string): Promise<void> {
    setError('')
    const result = await templatesService.getById(id)
    if (result.success && result.data) setDraft(structuredClone(result.data))
    else if (!result.success) setError(result.error.message)
  }

  async function createFromDocument(): Promise<void> {
    if (isCreating) return
    setIsCreating(true)
    setError('')
    setProgress({ step: 1, message: 'Lendo documento...' })
    try {
      const result = await templatesService.createFromDocument()
      if (result.success) {
        setDraft(structuredClone(result.data))
        await loadTemplates(result.data.metadata.id)
        setProgress({ step: 7, message: 'Modelo pronto para revisão.' })
      } else if (result.error.code === 'CANCELED') setProgress(null)
      else {
        setError(result.error.message)
        setProgress(null)
      }
    } catch {
      setError('Não foi possível iniciar a criação do modelo.')
      setProgress(null)
    } finally {
      setIsCreating(false)
    }
  }

  async function save(): Promise<void> {
    if (!draft || isSaving) return
    setIsSaving(true)
    setError('')
    try {
      const result = await templatesService.update(draft)
      if (result.success) {
        setDraft(structuredClone(result.data))
        await loadTemplates(result.data.metadata.id)
      } else setError(result.error.message)
    } catch {
      setError('Não foi possível atualizar o modelo.')
    } finally {
      setIsSaving(false)
    }
  }

  async function confirmTemplate(): Promise<void> {
    if (!draft || draft.metadata.status !== 'draft') return
    setIsSaving(true)
    setError('')
    try {
      const result = await templatesService.confirm(draft.metadata.id)
      if (result.success) {
        setDraft(structuredClone(result.data))
        await loadTemplates(result.data.metadata.id)
      } else setError(result.error.message)
    } catch {
      setError('Não foi possível confirmar o modelo.')
    } finally {
      setIsSaving(false)
    }
  }

  async function removeTemplate(): Promise<void> {
    if (!draft) return
    setIsSaving(true)
    setError('')
    try {
      const result = await templatesService.delete(draft.metadata.id)
      if (result.success) await loadTemplates()
      else setError(result.error.message)
    } catch {
      setError('Não foi possível excluir o modelo.')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <section className="templates-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Modelos aprendidos</span>
          <h2>Modelos</h2>
          <p>Crie e revise modelos aprendidos sem perder seus padrões ricos.</p>
        </div>
        <button
          className="compact-button"
          type="button"
          onClick={() => void createFromDocument()}
          disabled={isCreating}
        >
          {isCreating ? 'Analisando DOCX...' : '+ Importar um DOCX'}
        </button>
      </header>

      {error && (
        <div className="message error-message" role="alert">
          {error}
        </div>
      )}

      {progress && (
        <div className="template-progress" aria-live="polite">
          <strong>{progress.message}</strong>
          <ol>
            {TEMPLATE_PROGRESS_LABELS.map((label, index) => {
              const step = index + 1
              const state =
                step < progress.step
                  ? 'completed'
                  : step === progress.step
                    ? 'active'
                    : 'pending'
              return (
                <li className={state} key={label}>
                  {label}
                </li>
              )
            })}
          </ol>
        </div>
      )}

      <div className="templates-workspace">
        <aside className="template-list" aria-label="Modelos disponíveis">
          {isLoading && <p>Carregando...</p>}
          {!isLoading && templates.length === 0 && (
            <p className="empty-hint">Nenhum modelo.</p>
          )}
          {templates.map((item) => (
            <button
              type="button"
              className={`template-item ${draft?.metadata.id === item.metadata.id ? 'active' : ''}`}
              onClick={() => void selectTemplate(item.metadata.id)}
              key={item.metadata.id}
            >
              <strong>{item.metadata.name}</strong>
              <span className={`template-status ${item.metadata.status}`}>
                {item.metadata.status}
              </span>
              <span>versão {item.version}</span>
            </button>
          ))}
        </aside>

        <div className="template-content">
          {draft ? (
            <article className="template-details">
              <div className="template-metadata-header">
                <div>
                  <span
                    className={`badge template-status ${draft.metadata.status}`}
                  >
                    {draft.metadata.status}
                  </span>
                  <span className="badge">versão {draft.version}</span>
                </div>
                <small>ID: {draft.metadata.id}</small>
              </div>
              <div className="form-grid">
                <label>
                  Nome
                  <input
                    value={draft.metadata.name}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        metadata: {
                          ...draft.metadata,
                          name: event.target.value,
                        },
                      })
                    }
                    disabled={isSaving}
                  />
                </label>
                <label>
                  Tipo documental
                  <input value={draft.metadata.documentType} disabled />
                </label>
                <label className="full-field">
                  Descrição
                  <textarea
                    value={draft.metadata.description}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        metadata: {
                          ...draft.metadata,
                          description: event.target.value,
                        },
                      })
                    }
                    disabled={isSaving}
                  />
                </label>
              </div>
              <dl className="template-lifecycle">
                <div>
                  <dt>Criado em</dt>
                  <dd>
                    {new Date(draft.metadata.createdAt).toLocaleString('pt-BR')}
                  </dd>
                </div>
                <div>
                  <dt>Atualizado em</dt>
                  <dd>
                    {new Date(draft.metadata.updatedAt).toLocaleString('pt-BR')}
                  </dd>
                </div>
              </dl>

              <TemplateReview template={draft} />

              <div className="detail-actions">
                <button
                  type="button"
                  onClick={() => void save()}
                  disabled={
                    isSaving ||
                    !draft.metadata.name.trim() ||
                    !draft.metadata.description.trim()
                  }
                >
                  {isSaving ? 'Salvando...' : 'Salvar nome e descrição'}
                </button>
                {draft.metadata.status === 'draft' && (
                  <button
                    className="secondary-button"
                    type="button"
                    onClick={() => void confirmTemplate()}
                    disabled={isSaving}
                  >
                    Confirmar modelo
                  </button>
                )}
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void removeTemplate()}
                  disabled={isSaving}
                >
                  Excluir
                </button>
              </div>
            </article>
          ) : (
            <p>Importe ou selecione um modelo.</p>
          )}
        </div>
      </div>
    </section>
  )
}
