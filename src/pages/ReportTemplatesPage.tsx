import { useState } from 'react'
import { documentsService } from '../services/documents.service'
import { templatesService } from '../services/templates.service'
import type {
  ReportFormality,
  ReportField,
  ReportFieldType,
  ReportSection,
  ReportTemplate,
  ReportHierarchyNode,
} from '../types/report-template'
import type {
  ImportTemplateResult,
  TemplateImportProgress,
} from '../types/template-import'

interface ReportTemplatesPageProps {
  templates: ReportTemplate[]
  selectedId: string
  onSelect(id: string): void
  onChanged(): Promise<void>
}

function emptySection(order: number): ReportSection {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    required: true,
    order,
    parentSectionId: null,
    level: 1,
    repeatable: false,
    semanticPurpose: '',
    writingStyle: '',
    formattingStyle: '',
  }
}

function emptyTemplate(): ReportTemplate {
  return {
    id: crypto.randomUUID(),
    name: '',
    description: '',
    objective: '',
    tone: 'formal',
    style: 'technical',
    formality: 'medium',
    sections: [emptySection(1)],
    fields: [],
    writingRules: [],
    recommendedVocabulary: [],
    forbiddenExpressions: [],
    documentType: '',
    status: 'confirmed',
    hierarchy: [],
    activityPatterns: [],
    semanticRules: [],
    formattingRules: [],
    requiredElements: [],
    optionalElements: [],
    repeatableElements: [],
  }
}

function hierarchyFromSections(
  sections: ReportSection[],
): ReportHierarchyNode[] {
  const nodes = new Map(
    sections.map((section) => [
      section.id,
      { sectionId: section.id, children: [] as ReportHierarchyNode[] },
    ]),
  )
  const roots: ReportHierarchyNode[] = []
  for (const section of sections) {
    const node = nodes.get(section.id)
    if (!node) continue
    const parent = section.parentSectionId
      ? nodes.get(section.parentSectionId)
      : undefined
    if (parent && parent !== node) parent.children.push(node)
    else roots.push(node)
  }
  return roots
}

function emptyField(): ReportField {
  return {
    id: crypto.randomUUID(),
    name: '',
    label: '',
    type: 'text',
    required: false,
    description: '',
  }
}

export function ReportTemplatesPage({
  templates,
  selectedId,
  onSelect,
  onChanged,
}: ReportTemplatesPageProps) {
  const [draft, setDraft] = useState<ReportTemplate | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [error, setError] = useState('')
  const [isSaving, setIsSaving] = useState(false)
  const [showCreationOptions, setShowCreationOptions] = useState(false)
  const [isImporting, setIsImporting] = useState(false)
  const [importProgress, setImportProgress] =
    useState<TemplateImportProgress | null>(null)
  const [importedFileName, setImportedFileName] = useState<string | null>(null)
  const selected = templates.find((template) => template.id === selectedId)

  function startCreate(): void {
    setDraft(emptyTemplate())
    setEditingId(null)
    setError('')
    setShowCreationOptions(false)
    setImportedFileName(null)
  }

  async function importTemplate(): Promise<void> {
    if (isImporting) return
    setIsImporting(true)
    setImportProgress({ step: 1, message: 'Lendo documento...' })
    setError('')
    const stopProgress =
      documentsService.onTemplateImportProgress(setImportProgress)
    let result: ImportTemplateResult
    try {
      result = await documentsService.selectAndAnalyzeTemplate()
    } catch {
      setError('Não foi possível iniciar a importação do documento.')
      setImportProgress(null)
      return
    } finally {
      stopProgress()
      setIsImporting(false)
    }
    if (result.success) {
      setDraft(result.data)
      setEditingId(null)
      setImportedFileName(result.fileName)
      setShowCreationOptions(false)
      setImportProgress({ step: 7, message: 'Modelo pronto para revisão.' })
    } else if (!result.canceled) {
      setError(result.error.message)
      setImportProgress(null)
    } else {
      setImportProgress(null)
    }
  }

  function startEdit(template: ReportTemplate): void {
    setDraft(structuredClone(template))
    setEditingId(template.id)
    setError('')
    setShowCreationOptions(false)
    setImportedFileName(null)
  }

  function updateSection(index: number, change: Partial<ReportSection>): void {
    if (!draft) return
    setDraft({
      ...draft,
      sections: draft.sections.map((section, sectionIndex) =>
        sectionIndex === index ? { ...section, ...change } : section,
      ),
    })
  }

  async function save(): Promise<void> {
    if (!draft || isSaving) return
    setIsSaving(true)
    setError('')
    const sectionIds = new Set(draft.sections.map((section) => section.id))
    const reviewedSections = draft.sections.map((section) => ({
      ...section,
      parentSectionId:
        section.parentSectionId && sectionIds.has(section.parentSectionId)
          ? section.parentSectionId
          : null,
    }))
    const reviewedDraft: ReportTemplate = {
      ...draft,
      sections: reviewedSections,
      status: 'confirmed',
      hierarchy: hierarchyFromSections(reviewedSections),
      requiredElements: reviewedSections
        .filter((section) => section.required)
        .map((section) => section.name),
      optionalElements: reviewedSections
        .filter((section) => !section.required)
        .map((section) => section.name),
      repeatableElements: reviewedSections
        .filter((section) => section.repeatable)
        .map((section) => section.name),
    }
    const result = editingId
      ? await templatesService.update(editingId, reviewedDraft)
      : await templatesService.create(reviewedDraft)

    if (result.success) {
      setDraft(null)
      setEditingId(null)
      setImportedFileName(null)
      onSelect(result.data.id)
      await onChanged()
    } else {
      setError(result.error.message)
    }
    setIsSaving(false)
  }

  async function remove(id: string): Promise<void> {
    const result = await templatesService.delete(id)
    if (result.success) {
      setDraft(null)
      await onChanged()
    } else setError(result.error.message)
  }

  return (
    <section className="templates-page">
      <header className="page-header">
        <div>
          <span className="eyebrow">Configuração em memória</span>
          <h2>Modelos de Relatório</h2>
          <p>
            Defina a estrutura e as regras que orientarão relatórios futuros.
          </p>
        </div>
        <button
          className="compact-button"
          type="button"
          onClick={() => setShowCreationOptions(true)}
        >
          + Novo modelo
        </button>
      </header>

      {error && (
        <div className="message error-message" role="alert">
          {error}
        </div>
      )}

      <div className="templates-workspace">
        <aside className="template-list" aria-label="Modelos disponíveis">
          {templates.map((template) => (
            <button
              className={
                template.id === selectedId
                  ? 'template-item active'
                  : 'template-item'
              }
              type="button"
              key={template.id}
              onClick={() => onSelect(template.id)}
            >
              <strong>{template.name}</strong>
              <span>{template.sections.length} seções</span>
            </button>
          ))}
        </aside>

        <div className="template-content">
          {showCreationOptions && !draft ? (
            <div className="creation-options">
              <h3>Como deseja criar?</h3>
              <button
                className="creation-option recommended"
                type="button"
                onClick={() => void importTemplate()}
                disabled={isImporting}
              >
                <strong>
                  {isImporting
                    ? 'Analisando documento...'
                    : 'Importar relatório existente'}
                </strong>
                <span>Recomendado · um único DOCX</span>
                <p>
                  O SIEAR identifica estrutura, campos e regras para você
                  revisar.
                </p>
              </button>
              {isImporting && importProgress && (
                <div
                  className="import-progress"
                  role="status"
                  aria-live="polite"
                >
                  <progress value={importProgress.step} max={7} />
                  <strong>Etapa {importProgress.step} de 7</strong>
                  <span>{importProgress.message}</span>
                </div>
              )}
              <button
                className="creation-option"
                type="button"
                onClick={startCreate}
              >
                <strong>Criar manualmente</strong>
                <span>Opção secundária</span>
                <p>Configure cada característica do modelo desde o início.</p>
              </button>
              <button
                className="text-button"
                type="button"
                onClick={() => setShowCreationOptions(false)}
              >
                Cancelar
              </button>
            </div>
          ) : draft ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <h3>
                {editingId
                  ? 'Editar modelo'
                  : importedFileName
                    ? 'Revisar modelo importado'
                    : 'Novo modelo manual'}
              </h3>
              {importedFileName && (
                <p className="review-notice">
                  Analise os dados identificados em{' '}
                  <strong>{importedFileName}</strong>. O modelo só será
                  adicionado após sua confirmação.
                </p>
              )}
              <div className="form-grid">
                <label>
                  Tipo de documento
                  <input
                    value={draft.documentType ?? ''}
                    onChange={(event) =>
                      setDraft({ ...draft, documentType: event.target.value })
                    }
                  />
                </label>
                <label>
                  Nome
                  <input
                    value={draft.name}
                    onChange={(event) =>
                      setDraft({ ...draft, name: event.target.value })
                    }
                  />
                </label>
                <label>
                  Descrição
                  <textarea
                    rows={2}
                    value={draft.description}
                    onChange={(event) =>
                      setDraft({ ...draft, description: event.target.value })
                    }
                  />
                </label>
                <label className="full-field">
                  Objetivo
                  <textarea
                    rows={2}
                    value={draft.objective}
                    onChange={(event) =>
                      setDraft({ ...draft, objective: event.target.value })
                    }
                  />
                </label>
                <label>
                  Tom
                  <input
                    value={draft.tone}
                    onChange={(event) =>
                      setDraft({ ...draft, tone: event.target.value })
                    }
                  />
                </label>
                <label>
                  Estilo
                  <input
                    value={draft.style}
                    onChange={(event) =>
                      setDraft({ ...draft, style: event.target.value })
                    }
                  />
                </label>
                <label>
                  Formalidade
                  <select
                    value={draft.formality}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        formality: event.target.value as ReportFormality,
                      })
                    }
                  >
                    <option value="low">Baixa</option>
                    <option value="medium">Média</option>
                    <option value="high">Alta</option>
                  </select>
                </label>
              </div>

              <div className="sections-editor">
                <div className="section-heading">
                  <h3>Seções</h3>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        sections: [
                          ...draft.sections,
                          emptySection(draft.sections.length + 1),
                        ],
                      })
                    }
                  >
                    Adicionar seção
                  </button>
                </div>
                {draft.sections.map((section, index) => (
                  <div className="section-editor" key={section.id}>
                    <label>
                      Nome
                      <input
                        value={section.name}
                        onChange={(event) =>
                          updateSection(index, { name: event.target.value })
                        }
                      />
                    </label>
                    <label>
                      Descrição
                      <input
                        value={section.description}
                        onChange={(event) =>
                          updateSection(index, {
                            description: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label>
                      Ordem
                      <input
                        type="number"
                        value={section.order}
                        onChange={(event) =>
                          updateSection(index, {
                            order: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Nível
                      <input
                        type="number"
                        min="1"
                        value={section.level ?? 1}
                        onChange={(event) =>
                          updateSection(index, {
                            level: Number(event.target.value),
                          })
                        }
                      />
                    </label>
                    <label>
                      Seção pai
                      <select
                        value={section.parentSectionId ?? ''}
                        onChange={(event) =>
                          updateSection(index, {
                            parentSectionId: event.target.value || null,
                          })
                        }
                      >
                        <option value="">Nenhuma</option>
                        {draft.sections
                          .filter((candidate) => candidate.id !== section.id)
                          .map((candidate) => (
                            <option key={candidate.id} value={candidate.id}>
                              {candidate.name || 'Seção sem nome'}
                            </option>
                          ))}
                      </select>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={section.required}
                        onChange={(event) =>
                          updateSection(index, {
                            required: event.target.checked,
                          })
                        }
                      />
                      Obrigatória
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={section.repeatable ?? false}
                        onChange={(event) =>
                          updateSection(index, {
                            repeatable: event.target.checked,
                          })
                        }
                      />
                      Repetível
                    </label>
                    <button
                      className="danger-text-button"
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          sections: draft.sections.filter(
                            (_, sectionIndex) => sectionIndex !== index,
                          ),
                        })
                      }
                    >
                      Remover
                    </button>
                    <label className="full-field">
                      Função semântica
                      <input
                        value={section.semanticPurpose ?? ''}
                        onChange={(event) =>
                          updateSection(index, {
                            semanticPurpose: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="full-field">
                      Estilo de escrita
                      <input
                        value={section.writingStyle ?? ''}
                        onChange={(event) =>
                          updateSection(index, {
                            writingStyle: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="full-field">
                      Formatação
                      <input
                        value={section.formattingStyle ?? ''}
                        onChange={(event) =>
                          updateSection(index, {
                            formattingStyle: event.target.value,
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>
              <div className="sections-editor">
                <div className="section-heading">
                  <h3>Campos variáveis</h3>
                  <button
                    className="text-button"
                    type="button"
                    onClick={() =>
                      setDraft({
                        ...draft,
                        fields: [...draft.fields, emptyField()],
                      })
                    }
                  >
                    Adicionar campo
                  </button>
                </div>
                {draft.fields.length === 0 && (
                  <p className="empty-hint">
                    Nenhum campo variável identificado.
                  </p>
                )}
                {draft.fields.map((field, index) => (
                  <div className="section-editor field-editor" key={field.id}>
                    <label>
                      Nome
                      <input
                        value={field.name}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, name: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Rótulo
                      <input
                        value={field.label}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, label: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                    <label>
                      Tipo
                      <select
                        value={field.type}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? {
                                    ...item,
                                    type: event.target.value as ReportFieldType,
                                  }
                                : item,
                            ),
                          })
                        }
                      >
                        <option value="text">Texto</option>
                        <option value="date">Data</option>
                        <option value="number">Número</option>
                        <option value="boolean">Sim/Não</option>
                      </select>
                    </label>
                    <label className="checkbox-field">
                      <input
                        type="checkbox"
                        checked={field.required}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, required: event.target.checked }
                                : item,
                            ),
                          })
                        }
                      />
                      Obrigatório
                    </label>
                    <button
                      className="danger-text-button"
                      type="button"
                      onClick={() =>
                        setDraft({
                          ...draft,
                          fields: draft.fields.filter(
                            (_, itemIndex) => itemIndex !== index,
                          ),
                        })
                      }
                    >
                      Remover
                    </button>
                    <label className="full-field">
                      Descrição
                      <input
                        value={field.description}
                        onChange={(event) =>
                          setDraft({
                            ...draft,
                            fields: draft.fields.map((item, itemIndex) =>
                              itemIndex === index
                                ? { ...item, description: event.target.value }
                                : item,
                            ),
                          })
                        }
                      />
                    </label>
                  </div>
                ))}
              </div>

              <div className="form-grid rules-editor">
                <label className="full-field">
                  Regras de escrita <span>uma por linha</span>
                  <textarea
                    rows={4}
                    value={draft.writingRules.join('\n')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        writingRules: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label>
                  Vocabulário recomendado <span>um por linha</span>
                  <textarea
                    rows={4}
                    value={draft.recommendedVocabulary.join('\n')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        recommendedVocabulary: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="full-field">
                  Regras semânticas <span>uma por linha</span>
                  <textarea
                    rows={4}
                    value={(draft.semanticRules ?? []).join('\n')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        semanticRules: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label className="full-field">
                  Regras de formatação <span>uma por linha</span>
                  <textarea
                    rows={6}
                    value={(draft.formattingRules ?? []).join('\n')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        formattingRules: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
                <label>
                  Expressões proibidas <span>uma por linha</span>
                  <textarea
                    rows={4}
                    value={draft.forbiddenExpressions.join('\n')}
                    onChange={(event) =>
                      setDraft({
                        ...draft,
                        forbiddenExpressions: event.target.value
                          .split('\n')
                          .map((item) => item.trim())
                          .filter(Boolean),
                      })
                    }
                  />
                </label>
              </div>
              <div className="form-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => setDraft(null)}
                >
                  Cancelar
                </button>
                <button type="submit" disabled={isSaving}>
                  {isSaving
                    ? 'Salvando...'
                    : importedFileName
                      ? 'Confirmar modelo'
                      : 'Salvar modelo'}
                </button>
              </div>
            </form>
          ) : selected ? (
            <article className="template-details">
              <span className="badge">Formalidade {selected.formality}</span>
              <h3>{selected.name}</h3>
              <p>{selected.description}</p>
              <dl>
                <div>
                  <dt>Objetivo</dt>
                  <dd>{selected.objective}</dd>
                </div>
                <div>
                  <dt>Tom e estilo</dt>
                  <dd>
                    {selected.tone} · {selected.style}
                  </dd>
                </div>
              </dl>
              <h4>Estrutura</h4>
              <ol>
                {[...selected.sections]
                  .sort((a, b) => a.order - b.order)
                  .map((section) => (
                    <li key={section.id}>
                      <strong>{section.name}</strong>
                      <span>
                        {section.required ? 'Obrigatória' : 'Opcional'} · ordem{' '}
                        {section.order}
                      </span>
                      <p>{section.description}</p>
                    </li>
                  ))}
              </ol>
              <h4>Regras de escrita</h4>
              {selected.writingRules.length ? (
                <ul>
                  {selected.writingRules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              ) : (
                <p>Não informado</p>
              )}
              <h4>Campos variáveis</h4>
              {selected.fields.length ? (
                <ul>
                  {selected.fields.map((field) => (
                    <li key={field.id}>
                      <strong>{field.label || field.name}</strong> ·{' '}
                      {field.type} ·{' '}
                      {field.required ? 'obrigatório' : 'opcional'}
                    </li>
                  ))}
                </ul>
              ) : (
                <p>Não informado</p>
              )}
              <div className="detail-actions">
                <button
                  className="secondary-button"
                  type="button"
                  onClick={() => startEdit(selected)}
                >
                  Editar
                </button>
                <button
                  className="danger-button"
                  type="button"
                  onClick={() => void remove(selected.id)}
                >
                  Excluir
                </button>
              </div>
            </article>
          ) : (
            <p>Selecione ou crie um modelo.</p>
          )}
        </div>
      </div>
    </section>
  )
}
