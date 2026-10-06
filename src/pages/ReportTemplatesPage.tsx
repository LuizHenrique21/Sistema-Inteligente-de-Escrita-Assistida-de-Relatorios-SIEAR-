import { useEffect, useMemo, useRef, useState } from 'react'
import { TemplateReview } from '../components/templates/TemplateReview'
import { TemplateLibraryOverview } from '../components/templates/TemplateLibraryOverview'
import { TemplateCreationProgress } from '../components/templates/TemplateCreationProgress'
import { TemplateList } from '../components/templates/TemplateList'
import { templatesService } from '../services/templates.service'
import type { TemplateImportProgress } from '../types/template-import'
import type { ReportTemplate } from '../domain/templates/report-template'
import { estimateTemplateCreationTime } from '../services/template-creation-time'
import styles from './ReportTemplatesPage.module.css'

const TEMPLATE_PROGRESS_LABELS = [
  'Extração',
  'Estrutura',
  'Escrita',
  'Semântica',
  'Formatação',
  'Consolidação',
  'Finalização',
] as const

function progressPercent(step: TemplateImportProgress['step']): number {
  return Math.round(((step - 1) / (TEMPLATE_PROGRESS_LABELS.length - 1)) * 100)
}

export function ReportTemplatesPage() {
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [draft, setDraft] = useState<ReportTemplate | null>(null)
  const [progress, setProgress] = useState<TemplateImportProgress | null>(null)
  const [error, setError] = useState('')
  const [isLoading, setIsLoading] = useState(true)
  const [isCreating, setIsCreating] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [stageStartedAt, setStageStartedAt] = useState<number | null>(null)
  const [clock, setClock] = useState(() => Date.now())
  const [showEditor, setShowEditor] = useState(false)
  const [showTechnicalDetails, setShowTechnicalDetails] = useState(false)
  const progressStep = useRef<TemplateImportProgress['step'] | null>(null)
  const percentage = progress ? progressPercent(progress.step) : 0
  const templateSummary = useMemo(
    () => ({
      total: templates.length,
      drafts: templates.filter((item) => item.metadata.status === 'draft')
        .length,
      confirmed: templates.filter(
        (item) => item.metadata.status === 'confirmed',
      ).length,
    }),
    [templates],
  )
  const timeEstimate =
    progress && stageStartedAt !== null && isCreating
      ? estimateTemplateCreationTime(progress, stageStartedAt, clock)
      : null

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
      if (!active) return
      if (progressStep.current !== item.step) {
        progressStep.current = item.step
        setStageStartedAt(Date.now())
      }
      setProgress(item)
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

  useEffect(() => {
    if (!isCreating) return
    const interval = window.setInterval(() => setClock(Date.now()), 1_000)
    return () => window.clearInterval(interval)
  }, [isCreating])

  async function selectTemplate(id: string): Promise<void> {
    setError('')
    setShowEditor(false)
    setShowTechnicalDetails(false)
    const result = await templatesService.getById(id)
    if (result.success && result.data) setDraft(structuredClone(result.data))
    else if (!result.success) setError(result.error.message)
  }

  async function createFromDocument(): Promise<void> {
    if (isCreating) return
    setIsCreating(true)
    setError('')
    const startedAt = Date.now()
    progressStep.current = 1
    setStageStartedAt(startedAt)
    setClock(startedAt)
    setProgress({ step: 1, message: 'Lendo documento...' })
    try {
      const result = await templatesService.createFromDocument()
      if (result.success) {
        setShowEditor(false)
        setShowTechnicalDetails(false)
        setDraft(structuredClone(result.data))
        await loadTemplates(result.data.metadata.id)
        progressStep.current = 7
        setStageStartedAt(Date.now())
        setProgress({ step: 7, message: 'Modelo pronto para revisão.' })
      } else if (result.error.code === 'CANCELED') {
        progressStep.current = null
        setStageStartedAt(null)
        setProgress(null)
      } else {
        setError(result.error.message)
        progressStep.current = null
        setStageStartedAt(null)
        setProgress(null)
      }
    } catch {
      setError('Não foi possível iniciar a criação do modelo.')
      progressStep.current = null
      setStageStartedAt(null)
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
    if (!window.confirm(`Excluir o modelo “${draft.metadata.name}”?`)) return
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
    <section className={styles.page}>
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

      <TemplateLibraryOverview {...templateSummary} />

      {error && (
        <div className="message error-message" role="alert">
          {error}
        </div>
      )}

      {progress && (
        <TemplateCreationProgress
          progress={progress}
          percentage={percentage}
          labels={TEMPLATE_PROGRESS_LABELS}
          estimate={timeEstimate}
        />
      )}

      <div className="templates-workspace">
        <TemplateList
          templates={templates}
          selectedId={draft?.metadata.id}
          isLoading={isLoading}
          onSelect={(id) => void selectTemplate(id)}
        />

        <div className="template-content">
          {draft ? (
            <article className={styles.details}>
              <header className={styles.modelHeader}>
                <div>
                  <span
                    className={
                      draft.metadata.status === 'confirmed'
                        ? styles.confirmed
                        : styles.draft
                    }
                  >
                    {draft.metadata.status === 'confirmed'
                      ? 'Pronto para uso'
                      : 'Em revisão'}
                  </span>
                  <h3>{draft.metadata.name}</h3>
                  <p>{draft.metadata.description}</p>
                </div>
                <span className={styles.documentType}>
                  {draft.metadata.documentType}
                </span>
              </header>
              {draft.metadata.status === 'draft' && (
                <div className="review-notice">
                  Este modelo ainda não está disponível para geração. Confirme-o
                  quando estiver satisfeito com o resumo.
                </div>
              )}
              <dl className={styles.quickFacts}>
                <div>
                  <dt>Seções</dt>
                  <dd>{draft.structurePattern.sections.length}</dd>
                </div>
                <div>
                  <dt>Campos</dt>
                  <dd>{draft.fields.length}</dd>
                </div>
                <div>
                  <dt>Estilo</dt>
                  <dd>{draft.writingPattern.globalStyle.formality}</dd>
                </div>
                <div>
                  <dt>Atualizado</dt>
                  <dd>
                    {new Date(draft.metadata.updatedAt).toLocaleDateString(
                      'pt-BR',
                    )}
                  </dd>
                </div>
              </dl>
              <div className={styles.primaryActions}>
                {draft.metadata.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => void confirmTemplate()}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Salvando...' : 'Confirmar e usar'}
                  </button>
                )}
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setShowEditor((value) => !value)}
                  disabled={isSaving}
                >
                  {showEditor ? 'Fechar edição' : 'Editar informações'}
                </button>
                <details className={styles.moreActions}>
                  <summary>Mais ações</summary>
                  <button
                    className="danger-button"
                    type="button"
                    onClick={() => void removeTemplate()}
                    disabled={isSaving}
                  >
                    Excluir modelo
                  </button>
                </details>
              </div>
              {showEditor && (
                <div className={`form-grid ${styles.editor}`}>
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
                  <button
                    className={styles.saveButton}
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
                </div>
              )}

              <details
                className={styles.technicalDetails}
                open={showTechnicalDetails}
                onToggle={(event) =>
                  setShowTechnicalDetails(event.currentTarget.open)
                }
              >
                <summary>Ver análise técnica e evidências</summary>
                <TemplateReview template={draft} />
              </details>
            </article>
          ) : (
            <p>Importe ou selecione um modelo.</p>
          )}
        </div>
      </div>
    </section>
  )
}
