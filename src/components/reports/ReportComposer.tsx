import type { ReportTemplate } from '../../domain/templates/report-template'
import type { ReportGenerationProgress } from '../../types/generated-report'
import { PortalSelect } from '../ui/PortalSelect'
import { ReportGenerationProgress as GenerationProgress } from './ReportGenerationProgress'
import styles from './ReportComposer.module.css'

interface ReportComposerProps {
  description: string
  templates: ReportTemplate[]
  selectedTemplateId: string
  isExtracting: boolean
  isGenerating: boolean
  generationProgress: ReportGenerationProgress | null
  extractionError: string
  onDescriptionChange: (description: string) => void
  onTemplateChange: (templateId: string) => void
  onExtract: () => void
  onGenerate: () => void
  onCreateTemplate: () => void
}

export function ReportComposer({
  description,
  templates,
  selectedTemplateId,
  isExtracting,
  isGenerating,
  generationProgress,
  extractionError,
  onDescriptionChange,
  onTemplateChange,
  onExtract,
  onGenerate,
  onCreateTemplate,
}: ReportComposerProps) {
  const selectedTemplate = templates.find(
    (template) => template.metadata.id === selectedTemplateId,
  )
  const isBusy = isExtracting || isGenerating

  return (
    <section className={styles.card}>
      <div className={styles.heading}>
        <div>
          <span className="eyebrow">Contexto do relatório</span>
          <h2>O que foi realizado?</h2>
        </div>
      </div>
      <label id="report-template-label">Modelo de relatório</label>
      {templates.length ? (
        <PortalSelect
          ariaLabelledBy="report-template-label"
          options={templates.map((template) => ({
            value: template.metadata.id,
            label: template.metadata.name,
            description: template.metadata.documentType,
          }))}
          value={selectedTemplateId}
          disabled={isBusy}
          onChange={onTemplateChange}
        />
      ) : (
        <div className={styles.emptyTemplate}>
          <strong>Você ainda não tem um modelo.</strong>
          <span>Importe um DOCX de referência para criar o primeiro.</span>
          <button type="button" onClick={onCreateTemplate}>
            Criar modelo agora
          </button>
        </div>
      )}
      {selectedTemplate && <TemplateSummary template={selectedTemplate} />}
      <div className={styles.fieldHeading}>
        <label htmlFor="report-description">Descrição da atividade</label>
        <span>{description.length} caracteres</span>
      </div>
      <textarea
        id="report-description"
        value={description}
        onChange={(event) => onDescriptionChange(event.target.value)}
        placeholder="Ex.: equipamento, ações executadas, problemas encontrados, resultado e período."
        rows={9}
        disabled={isBusy}
      />
      <p className={styles.help}>
        Dê preferência a fatos verificáveis. Você poderá revisar as informações
        identificadas antes de gerar o documento.
      </p>
      <div className={styles.actions}>
        <button
          className={styles.secondaryButton}
          type="button"
          onClick={onExtract}
          disabled={isBusy || !description.trim()}
        >
          {isExtracting
            ? 'Analisando informações...'
            : '1. Analisar informações'}
        </button>
        <button
          className={styles.primaryButton}
          type="button"
          onClick={onGenerate}
          disabled={isBusy || !selectedTemplateId || !description.trim()}
        >
          {isGenerating ? 'Gerando relatório...' : '2. Gerar relatório'}
        </button>
      </div>
      {isGenerating && generationProgress && (
        <GenerationProgress progress={generationProgress} />
      )}
      {!selectedTemplateId && templates.length > 0 && (
        <p className={styles.actionHint}>
          Selecione um modelo para liberar a geração.
        </p>
      )}
      {extractionError && (
        <div className={styles.error} role="alert">
          <strong>Não foi possível analisar as informações</strong>
          <p>{extractionError}</p>
        </div>
      )}
    </section>
  )
}

function TemplateSummary({ template }: { template: ReportTemplate }) {
  return (
    <aside className={styles.templateSummary} aria-label="Modelo selecionado">
      <div className={styles.templateIcon} aria-hidden="true">
        M
      </div>
      <div>
        <strong>{template.metadata.name}</strong>
        <span>{template.metadata.description}</span>
        <small>
          {template.structurePattern.sections.length} seções · Linguagem{' '}
          {template.writingPattern.globalStyle.formality}
        </small>
      </div>
    </aside>
  )
}
