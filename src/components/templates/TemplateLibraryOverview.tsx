import styles from './TemplateLibraryOverview.module.css'

export function TemplateLibraryOverview({
  total,
  drafts,
  confirmed,
}: {
  total: number
  drafts: number
  confirmed: number
}) {
  const entries = [
    [total, 'modelos no espaço'],
    [drafts, 'aguardando revisão'],
    [confirmed, 'prontos para uso'],
  ] as const
  return (
    <section className={styles.overview} aria-label="Resumo dos modelos">
      {entries.map(([value, label]) => (
        <div key={label}>
          <strong>{value}</strong>
          <span>{label}</span>
        </div>
      ))}
      <p>Um modelo confirmado pode ser escolhido ao criar um novo relatório.</p>
    </section>
  )
}
