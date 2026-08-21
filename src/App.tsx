import { useState } from 'react'
import type { AppInfo } from './types/siear-api'

const EXAMPLE_PROMPT = 'Explique em uma frase o que é manutenção preventiva.'

function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [status, setStatus] = useState('Pronto para testar')
  const [isCheckingApp, setIsCheckingApp] = useState(false)
  const [prompt, setPrompt] = useState(EXAMPLE_PROMPT)
  const [response, setResponse] = useState('')
  const [aiError, setAiError] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)

  async function testConnection(): Promise<void> {
    setIsCheckingApp(true)
    setStatus('Comunicando com o Electron...')
    try {
      setInfo(await window.siear.app.getInfo())
      setStatus('Comunicação funcionando')
    } catch {
      setStatus('Não foi possível comunicar com o Electron')
    } finally {
      setIsCheckingApp(false)
    }
  }

  async function generateWithAi(): Promise<void> {
    if (isGenerating) return

    const normalizedPrompt = prompt.trim()
    if (!normalizedPrompt) {
      setAiError('Digite um prompt antes de enviar para a IA.')
      return
    }

    setIsGenerating(true)
    setAiError('')
    setResponse('')

    try {
      const result = await window.siear.ai.generate({
        prompt: normalizedPrompt,
      })
      if (result.ok) setResponse(result.content)
      else setAiError(result.error.message)
    } catch {
      setAiError('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <main className="shell">
      <div className="layout">
        <section className="card app-card">
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
                <span aria-hidden="true" />
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
          <button
            type="button"
            onClick={testConnection}
            disabled={isCheckingApp}
          >
            {isCheckingApp ? 'Testando...' : 'Testar comunicação com Electron'}
          </button>
        </section>

        <section className="card ai-card">
          <span className="eyebrow">Integração local</span>
          <h2>Teste do Ollama</h2>
          <p className="section-description">
            O prompt é processado localmente pelo modelo configurado no SIEAR.
          </p>
          <label htmlFor="ai-prompt">Prompt</label>
          <textarea
            id="ai-prompt"
            value={prompt}
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Escreva uma frase sobre manutenção..."
            rows={5}
            disabled={isGenerating}
          />
          <button
            type="button"
            onClick={generateWithAi}
            disabled={isGenerating || prompt.trim() === ''}
          >
            {isGenerating ? 'Processando...' : 'Enviar para IA'}
          </button>
          {aiError && (
            <div className="message error-message" role="alert">
              <strong>Não foi possível gerar a resposta</strong>
              <p>{aiError}</p>
            </div>
          )}
          {response && (
            <div className="message response-message" aria-live="polite">
              <strong>Resposta</strong>
              <p>{response}</p>
            </div>
          )}
        </section>
      </div>
    </main>
  )
}

export default App
