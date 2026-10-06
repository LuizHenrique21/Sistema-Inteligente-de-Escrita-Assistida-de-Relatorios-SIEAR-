import type { ReportGenerationProgress as Progress } from '../../types/generated-report'
import styles from './ReportGenerationProgress.module.css'

function percentage(progress: Progress): number {
  if (progress.stage === 'extracting') return 12
  if (progress.stage === 'planning') return 28
  if (progress.stage === 'finalizing') return 100
  if (!progress.totalSections) return 30
  return Math.round(30 + (progress.completedSections / progress.totalSections) * 62)
}

export function ReportGenerationProgress({
  progress,
}: {
  progress: Progress
}) {
  const value = percentage(progress)
  const sectionCounter =
    progress.stage === 'writing' && progress.totalSections > 0
      ? `Seção ${Math.min(progress.completedSections + 1, progress.totalSections)} de ${progress.totalSections}`
      : 'Preparando geração'

  return (
    <section className={styles.progress} aria-live="polite">
      <div className={styles.header}>
        <div>
          <span className="eyebrow">Geração em andamento</span>
          <strong>{progress.message}</strong>
        </div>
        <output aria-label={`${value}% concluído`}>{value}%</output>
      </div>
      <progress
        value={value}
        max={100}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={value}
        aria-valuetext={`${value}% concluído: ${progress.message}`}
      >
        {value}%
      </progress>
      <p>{sectionCounter}</p>
    </section>
  )
}
