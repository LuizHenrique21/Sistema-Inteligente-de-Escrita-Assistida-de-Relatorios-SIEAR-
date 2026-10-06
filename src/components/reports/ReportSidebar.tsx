import styles from './ReportSidebar.module.css'

export function ReportSidebar({ templateCount }: { templateCount: number }) {
  return (
    <aside className={styles.panel}>
      <section className={`${styles.card} ${styles.privacyCard}`}>
        <span className={styles.icon} aria-hidden="true">
          ✓
        </span>
        <div>
          <strong>Revise antes de gerar</strong>
          <p>O sistema mostra dados ausentes em vez de inventar informações.</p>
        </div>
      </section>
      <section className={`${styles.card} ${styles.statsCard}`}>
        <span className="eyebrow">Seu espaço</span>
        <dl>
          <div>
            <dt>Modelos disponíveis</dt>
            <dd>{templateCount}</dd>
          </div>
          <div>
            <dt>Ambiente</dt>
            <dd>Local</dd>
          </div>
        </dl>
      </section>
    </aside>
  )
}
