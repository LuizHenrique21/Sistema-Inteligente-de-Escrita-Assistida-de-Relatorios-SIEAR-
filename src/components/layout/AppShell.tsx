import { useEffect, useState, type ReactNode } from 'react'
import styles from './AppShell.module.css'

export type AppPage = 'report' | 'templates'

interface AppShellProps {
  activePage: AppPage
  onNavigate: (page: AppPage) => void
  children: ReactNode
}

const PAGE_CONTEXT: Record<
  AppPage,
  { eyebrow: string; title: string; description: string }
> = {
  report: {
    eyebrow: 'Área de trabalho',
    title: 'Novo relatório',
    description:
      'Crie, revise e exporte documentos a partir das suas atividades.',
  },
  templates: {
    eyebrow: 'Biblioteca',
    title: 'Modelos de relatório',
    description: 'Organize referências e padrões reutilizáveis da sua equipe.',
  },
}

export function AppShell({ activePage, onNavigate, children }: AppShellProps) {
  const context = PAGE_CONTEXT[activePage]
  const [theme, setTheme] = useState<'light' | 'dark'>(() =>
    localStorage.getItem('siear-theme') === 'dark' ? 'dark' : 'light',
  )

  useEffect(() => {
    localStorage.setItem('siear-theme', theme)
  }, [theme])

  return (
    <main className={styles.shell} data-theme={theme}>
      <div className={styles.portal}>
        <aside className={styles.sidebar}>
          <button
            className={styles.brand}
            type="button"
            onClick={() => onNavigate('report')}
            aria-label="Ir para novo relatório"
          >
            <span className={styles.brandMark} aria-hidden="true">
              S
            </span>
            <span>
              <strong>SIEAR</strong>
              <small>Portal de relatórios</small>
            </span>
          </button>
          <div className={styles.workspaceLabel}>Navegação</div>
          <nav className={styles.navigation} aria-label="Navegação principal">
            <NavigationItem
              active={activePage === 'report'}
              icon="R"
              title="Relatórios"
              description="Criar documento"
              onClick={() => onNavigate('report')}
            />
            <NavigationItem
              active={activePage === 'templates'}
              icon="M"
              title="Modelos"
              description="Biblioteca e revisão"
              onClick={() => onNavigate('templates')}
            />
          </nav>
          <section className={styles.systemCard} aria-label="Preferências">
            <span className={styles.systemLabel}>Preferências</span>
            <button
              className={styles.themeButton}
              type="button"
              onClick={() =>
                setTheme((value) => (value === 'dark' ? 'light' : 'dark'))
              }
              aria-pressed={theme === 'dark'}
            >
              {theme === 'dark' ? 'Usar modo claro' : 'Usar modo escuro'}
            </button>
          </section>
        </aside>
        <section className={styles.content}>
          <header className={styles.contentHeader}>
            <div>
              <span className="eyebrow">{context.eyebrow}</span>
              <h1>{context.title}</h1>
              <p>{context.description}</p>
            </div>
          </header>
          <div className={styles.contentBody}>{children}</div>
        </section>
      </div>
    </main>
  )
}

function NavigationItem({
  active,
  icon,
  title,
  description,
  onClick,
}: {
  active: boolean
  icon: string
  title: string
  description: string
  onClick: () => void
}) {
  return (
    <button
      className={active ? styles.activeNavigationItem : styles.navigationItem}
      type="button"
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className={styles.navIcon} aria-hidden="true">
        {icon}
      </span>
      <span>
        <strong>{title}</strong>
        <small>{description}</small>
      </span>
    </button>
  )
}
