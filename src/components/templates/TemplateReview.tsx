import type { ReportTemplate } from '../../domain/templates/report-template'

function isObject(value: unknown): value is object {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function text(value: unknown): string {
  if (value === null || value === undefined) return 'Não informado'
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não'
  if (typeof value === 'object') return JSON.stringify(value, null, 2)
  return String(value)
}

function RichValue({ value }: { value: unknown }) {
  if (Array.isArray(value)) {
    if (value.length === 0) return <span className="empty-hint">Nenhum</span>
    return (
      <ul className="template-rich-list">
        {value.map((item, index) => (
          <li key={index}>
            <RichValue value={item} />
          </li>
        ))}
      </ul>
    )
  }
  if (isObject(value)) {
    return (
      <dl className="template-object-grid">
        {Object.entries(value).map(([key, item]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd>
              <RichValue value={item} />
            </dd>
          </div>
        ))}
      </dl>
    )
  }
  return <span>{text(value)}</span>
}

function PatternSection({ title, value }: { title: string; value: object }) {
  return (
    <details className="template-pattern-section" open>
      <summary>{title}</summary>
      <RichValue value={value} />
    </details>
  )
}

export function TemplateReview({
  template,
}: {
  template: ReportTemplate
}) {
  return (
    <div className="template-review" data-template-version={template.version}>
      <section>
        <h4>Estrutura</h4>
        <PatternSection
          title="Seções, subseções e hierarquia"
          value={template.structurePattern}
        />
        <PatternSection title="Requisitos" value={template.requirements} />
      </section>
      <section>
        <h4>Campos</h4>
        <RichValue value={template.fields} />
      </section>
      <section>
        <h4>Padrões de atividade</h4>
        <RichValue value={template.activityPatterns} />
      </section>
      <section>
        <h4>Escrita</h4>
        <RichValue value={template.writingPattern} />
      </section>
      <section>
        <h4>Semântica</h4>
        <RichValue value={template.semanticPattern} />
      </section>
      <section>
        <h4>Formatação</h4>
        <RichValue value={template.formattingPattern} />
      </section>
    </div>
  )
}
