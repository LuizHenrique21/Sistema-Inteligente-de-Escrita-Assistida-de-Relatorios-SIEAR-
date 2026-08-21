import { useState } from 'react'
import { templatesService } from '../services/templates.service'
import type {
  ReportFormality,
  ReportSection,
  ReportTemplate,
} from '../types/report-template'

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
    writingRules: [],
    recommendedVocabulary: [],
    forbiddenExpressions: [],
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
  const selected = templates.find((template) => template.id === selectedId)

  function startCreate(): void {
    setDraft(emptyTemplate())
    setEditingId(null)
    setError('')
  }

  function startEdit(template: ReportTemplate): void {
    setDraft(structuredClone(template))
    setEditingId(template.id)
    setError('')
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
    const result = editingId
      ? await templatesService.update(editingId, draft)
      : await templatesService.create(draft)

    if (result.success) {
      setDraft(null)
      setEditingId(null)
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
        <button className="compact-button" type="button" onClick={startCreate}>
          Criar modelo
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
          {draft ? (
            <form
              onSubmit={(event) => {
                event.preventDefault()
                void save()
              }}
            >
              <h3>{editingId ? 'Editar modelo' : 'Novo modelo'}</h3>
              <div className="form-grid">
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
                  </div>
                ))}
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
                  {isSaving ? 'Salvando...' : 'Salvar modelo'}
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
