import type { TemplateImportProgress } from '../../types/template-import'
import {
  formatRemainingTime,
  type TemplateCreationEstimate,
} from '../../services/template-creation-time'
import styles from './TemplateCreationProgress.module.css'

interface TemplateCreationProgressProps {
  progress: TemplateImportProgress
  percentage: number
  labels: readonly string[]
  estimate: TemplateCreationEstimate | null
}

export function TemplateCreationProgress({
  progress,
  percentage,
  labels,
  estimate,
}: TemplateCreationProgressProps) {
  return (
    <section
      className={styles.progress}
      aria-live="polite"
      aria-label="Progresso da criação do modelo"
    >
      <div className={styles.header}>
        <div>
          <span className="eyebrow">Criação do modelo</span>
          <strong>{progress.message}</strong>
        </div>
        <output aria-label={`${percentage}% concluído`}>{percentage}%</output>
      </div>
      <progress
        value={percentage}
        max={100}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percentage}
        aria-valuetext={`${percentage}% concluído: ${progress.message}`}
      >
        {percentage}%
      </progress>
      <p>
        Etapa {progress.step} de {labels.length} · você pode acompanhar a
        análise sem sair desta tela.
      </p>
      {estimate && (
        <dl className={styles.estimate}>
          <div>
            <dt>Etapa atual</dt>
            <dd>
              cerca de {formatRemainingTime(estimate.currentStageRemainingMs)}
            </dd>
          </div>
          <div>
            <dt>Total restante</dt>
            <dd>cerca de {formatRemainingTime(estimate.totalRemainingMs)}</dd>
          </div>
        </dl>
      )}
      <ol>
        {labels.map((label, index) => {
          const step = index + 1
          const state =
            step < progress.step
              ? styles.completed
              : step === progress.step
                ? styles.active
                : styles.pending
          return (
            <li className={state} key={label}>
              {label}
            </li>
          )
        })}
      </ol>
    </section>
  )
}
