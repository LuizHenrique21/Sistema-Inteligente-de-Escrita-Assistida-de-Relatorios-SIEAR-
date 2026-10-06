import type { ReportTemplate } from '../../domain/templates/report-template'
import styles from './TemplateList.module.css'

interface TemplateListProps {
  templates: ReportTemplate[]
  selectedId: string | undefined
  isLoading: boolean
  onSelect: (id: string) => void
}

export function TemplateList({
  templates,
  selectedId,
  isLoading,
  onSelect,
}: TemplateListProps) {
  return (
    <aside className={styles.list} aria-label="Modelos disponíveis">
      {isLoading && <p>Carregando...</p>}
      {!isLoading && templates.length === 0 && (
        <div className={styles.empty}>
          <span aria-hidden="true">+</span>
          <strong>Nenhum modelo ainda</strong>
          <p>Importe um documento para iniciar sua biblioteca.</p>
        </div>
      )}
      {templates.map((item) => (
        <button
          type="button"
          className={
            item.metadata.id === selectedId ? styles.activeItem : styles.item
          }
          onClick={() => onSelect(item.metadata.id)}
          key={item.metadata.id}
        >
          <strong>{item.metadata.name}</strong>
          <span
            className={`${styles.status} ${item.metadata.status === 'confirmed' ? styles.confirmed : styles.draft}`}
          >
            {item.metadata.status === 'confirmed' ? 'confirmado' : 'em revisão'}
          </span>
        </button>
      ))}
    </aside>
  )
}
