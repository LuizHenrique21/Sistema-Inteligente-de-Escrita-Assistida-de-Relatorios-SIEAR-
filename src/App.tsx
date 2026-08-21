import { useState } from 'react'
import type { AppInfo } from './types/siear-api'

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [status, setStatus] = useState('Pronto para testar')
  const [isLoading, setIsLoading] = useState(false)

  async function testConnection(): Promise<void> {
    setIsLoading(true)
    setStatus('Comunicando com o Electron...')
    try {
      setInfo(await window.siear.app.getInfo())
      setStatus('Comunicação funcionando')
    } catch {
      setStatus('Não foi possível comunicar com o Electron')
    } finally {
      setIsLoading(false)
    }
  }

  return (
    <main className="shell">
      <section className="card">
        <span className="eyebrow">Escrita assistida local</span>
        <h1>SIEAR</h1>
        <p className="subtitle">
          Sistema Inteligente de Escrita Assistida de Relatórios
        </p>
        <dl className="details">
          <div>
            <dt>Versão</dt>
            <dd>{info?.version ?? '0.1.0'}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd className="status">
              <span />
              {status}
            </dd>
          </div>
          {info && (
            <div>
              <dt>Ambiente</dt>
              <dd>{info.environment}</dd>
            </div>
          )}
        </dl>
        <button type="button" onClick={testConnection} disabled={isLoading}>
          {isLoading ? 'Testando...' : 'Testar comunicação com Electron'}
        </button>
      </section>
    </main>
  )
}

export default App
