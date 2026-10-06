import type { ReportTemplate } from '../../domain/templates/report-template'
import styles from './TemplateReview.module.css'

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
    if (value.length === 0)
      return <span className={styles.emptyHint}>Nenhum</span>
    return (
      <ul className={styles.richList}>
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
      <dl className={styles.objectGrid}>
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

function PatternSection({
  title,
  value,
  defaultOpen = false,
}: {
  title: string
  value: object
  defaultOpen?: boolean
}) {
  return (
    <details className={styles.patternSection} open={defaultOpen}>
      <summary>{title}</summary>
      <RichValue value={value} />
    </details>
  )
}

export function TemplateReview({ template }: { template: ReportTemplate }) {
  const summary = [
    ['Seções', template.structurePattern.sections.length],
    ['Campos', template.fields.length],
    ['Atividades', template.activityPatterns.length],
    ['Estilos', template.writingPattern.sectionStyles.length],
  ]
  return (
    <div className={styles.review} data-template-version={template.version}>
      <section className={styles.summary} aria-label="Resumo do modelo">
        <div>
          <span className="eyebrow">Visão geral do aprendizado</span>
          <p>
            Explore os detalhes abaixo por área. As evidências são preservadas
            para que a revisão seja rastreável.
          </p>
        </div>
        <dl>
          {summary.map(([label, value]) => (
            <div key={label}>
              <dt>{label}</dt>
              <dd>{value}</dd>
            </div>
          ))}
        </dl>
      </section>
      <section>
        <h4>Estrutura</h4>
        <PatternSection
          title="Seções, subseções e hierarquia"
          value={template.structurePattern}
          defaultOpen
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
