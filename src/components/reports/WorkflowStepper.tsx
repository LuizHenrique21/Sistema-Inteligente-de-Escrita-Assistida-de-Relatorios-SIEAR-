import styles from './WorkflowStepper.module.css'

export type ReportWorkflowStep = 1 | 2 | 3 | 4

const STEPS = [
  ['Escolha o modelo', 'Defina a estrutura'],
  ['Descreva a atividade', 'Inclua fatos e resultados'],
  ['Revise os dados', 'Corrija o que faltar'],
  ['Gere e exporte', 'Baixe em DOCX'],
] as const

export function WorkflowStepper({
  currentStep,
  hasTemplate,
}: {
  currentStep: ReportWorkflowStep
  hasTemplate: boolean
}) {
  return (
    <ol className={styles.workflow} aria-label="Etapas de criação do relatório">
      {STEPS.map(([title, description], index) => {
        const step = (index + 1) as ReportWorkflowStep
        const state =
          step === 1 && hasTemplate
            ? 'completed'
            : step < currentStep
              ? 'completed'
              : step === currentStep
                ? 'active'
                : 'pending'
        return (
          <li className={`${styles.step} ${styles[state]}`} key={title}>
            <span className={styles.number} aria-hidden="true">
              {state === 'completed' ? '✓' : step}
            </span>
            <span>
              <strong>{title}</strong>
              <small>{description}</small>
            </span>
          </li>
        )
      })}
    </ol>
  )
}
