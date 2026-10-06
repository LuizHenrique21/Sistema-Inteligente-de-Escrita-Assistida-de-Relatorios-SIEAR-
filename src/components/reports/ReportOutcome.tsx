import type {
  GeneratedReport,
  MissingRequiredInformation,
} from '../../types/generated-report'
import type { ReportInformation } from '../../types/siear-api'
import styles from './ReportOutcome.module.css'

interface ReportOutcomeProps {
  report: ReportInformation | null
  missingInformation: MissingRequiredInformation[]
  generationError: string
  generatedReport: GeneratedReport | null
  isExporting: boolean
  exportMessage: string
  onExport: () => void
}

export function ReportOutcome({
  report,
  missingInformation,
  generationError,
  generatedReport,
  isExporting,
  exportMessage,
  onExport,
}: ReportOutcomeProps) {
  if (
    !report &&
    !missingInformation.length &&
    !generationError &&
    !generatedReport
  )
    return null
  return (
    <section className={styles.area} aria-live="polite">
      {report && <ExtractionResult report={report} />}
      {missingInformation.length > 0 && (
        <div className={styles.warning} role="status">
          <strong>Faltam informações essenciais</strong>
          <p>Acrescente as respostas abaixo no relato e gere novamente.</p>
          <ul>
            {missingInformation.map((item) => (
              <li key={item.fieldId}>{item.question}</li>
            ))}
          </ul>
        </div>
      )}
      {generationError && (
        <div className={styles.error} role="alert">
          <strong>Não foi possível gerar o relatório</strong>
          <p>{generationError}</p>
        </div>
      )}
      {generatedReport && (
        <GeneratedDocument
          report={generatedReport}
          isExporting={isExporting}
          exportMessage={exportMessage}
          onExport={onExport}
        />
      )}
    </section>
  )
}

function ExtractionResult({ report }: { report: ReportInformation }) {
  const rows: Array<[string, React.ReactNode]> = [
    ['Equipamento', value(report.equipment)],
    [
      'Atividades',
      report.activities.length ? (
        <ul>
          {report.activities.map((activity) => (
            <li key={activity}>{activity}</li>
          ))}
        </ul>
      ) : (
        'Não informado'
      ),
    ],
    ['Resultado', value(report.result)],
    ['Problemas', value(report.problems)],
    ['Tempo', value(report.duration)],
    ['Observações', value(report.observations)],
  ]
  return (
    <article className={styles.result}>
      <header>
        <div>
          <span className="eyebrow">Etapa 3 · revisão</span>
          <h2>Informações identificadas</h2>
        </div>
        <span className={styles.success}>Pronto para gerar</span>
      </header>
      <dl className={styles.grid}>
        {rows.map(([label, content]) => (
          <div
            key={label}
            className={label === 'Atividades' ? styles.fullRow : undefined}
          >
            <dt>{label}</dt>
            <dd>{content}</dd>
          </div>
        ))}
      </dl>
      <details>
        <summary>Ver dados técnicos extraídos</summary>
        <pre>{JSON.stringify(report, null, 2)}</pre>
      </details>
    </article>
  )
}

function GeneratedDocument({
  report,
  isExporting,
  exportMessage,
  onExport,
}: {
  report: GeneratedReport
  isExporting: boolean
  exportMessage: string
  onExport: () => void
}) {
  return (
    <article className={styles.document}>
      <header>
        <div>
          <span className="eyebrow">Documento pronto</span>
          <h2>{report.templateName}</h2>
          <time dateTime={report.createdAt}>
            {new Date(report.createdAt).toLocaleString('pt-BR')}
          </time>
        </div>
        <button type="button" onClick={onExport} disabled={isExporting}>
          {isExporting ? 'Exportando...' : 'Exportar DOCX'}
        </button>
      </header>
      <div className={styles.documentBody}>
        {[...report.sections]
          .sort((first, second) => first.order - second.order)
          .map((section) => (
            <section key={section.id}>
              <h3>
                {section.order}. {section.name}
              </h3>
              <p>{section.content}</p>
            </section>
          ))}
      </div>
      {exportMessage && (
        <p className={styles.exportMessage} role="status">
          {exportMessage}
        </p>
      )}
    </article>
  )
}

function value(content: string | null): string {
  return content ?? 'Não informado'
}
