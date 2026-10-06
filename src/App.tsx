import { useCallback, useEffect, useState } from 'react'
import { AppShell, type AppPage } from './components/layout/AppShell'
import { ReportComposer } from './components/reports/ReportComposer'
import { ReportOutcome } from './components/reports/ReportOutcome'
import { ReportSidebar } from './components/reports/ReportSidebar'
import {
  WorkflowStepper,
  type ReportWorkflowStep,
} from './components/reports/WorkflowStepper'
import { ReportTemplatesPage } from './pages/ReportTemplatesPage'
import { aiService } from './services/ai.service'
import { templatesService } from './services/templates.service'
import type { ReportTemplate } from './domain/templates/report-template'
import type {
  GeneratedReport,
  MissingRequiredInformation,
  ReportGenerationProgress,
} from './types/generated-report'
import type { ReportInformation } from './types/siear-api'
import styles from './App.module.css'

const EXAMPLE_DESCRIPTION =
  'Troquei o HD do notebook Dell, instalei Windows 11 e atualizei os drivers. Depois fiz testes e o computador funcionou normalmente.'

function App() {
  const [activePage, setActivePage] = useState<AppPage>('report')
  const [templates, setTemplates] = useState<ReportTemplate[]>([])
  const [selectedTemplateId, setSelectedTemplateId] = useState('')
  const [description, setDescription] = useState(EXAMPLE_DESCRIPTION)
  const [extractedReport, setExtractedReport] =
    useState<ReportInformation | null>(null)
  const [extractionError, setExtractionError] = useState('')
  const [isExtracting, setIsExtracting] = useState(false)
  const [generatedReport, setGeneratedReport] =
    useState<GeneratedReport | null>(null)
  const [generationError, setGenerationError] = useState('')
  const [missingInformation, setMissingInformation] = useState<
    MissingRequiredInformation[]
  >([])
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationProgress, setGenerationProgress] =
    useState<ReportGenerationProgress | null>(null)
  const [isExporting, setIsExporting] = useState(false)
  const [exportMessage, setExportMessage] = useState('')

  const fetchLatestTemplates = useCallback(async (): Promise<void> => {
    try {
      const result = await templatesService.getAll()
      if (!result.success) return
      setTemplates(result.data)
      setSelectedTemplateId((currentId) =>
        result.data.some((template) => template.metadata.id === currentId)
          ? currentId
          : (result.data[0]?.metadata.id ?? ''),
      )
    } catch {
      // Keep the currently loaded model list usable when refresh fails.
    }
  }, [])

  useEffect(() => {
    const timer = window.setTimeout(() => void fetchLatestTemplates(), 0)
    return () => window.clearTimeout(timer)
  }, [fetchLatestTemplates])

  useEffect(
    () => aiService.onReportGenerationProgress(setGenerationProgress),
    [],
  )

  function navigate(page: AppPage): void {
    setActivePage(page)
    if (page === 'report') void fetchLatestTemplates()
  }

  function resetOutcome(): void {
    setExtractedReport(null)
    setExtractionError('')
    setGeneratedReport(null)
    setGenerationError('')
    setMissingInformation([])
    setExportMessage('')
  }

  async function extractInformation(): Promise<void> {
    const text = description.trim()
    if (!text || isExtracting) {
      if (!text) setExtractionError('Descreva a atividade antes de continuar.')
      return
    }
    setIsExtracting(true)
    resetOutcome()
    try {
      const result = await aiService.extractReportInformation({ text })
      if (result.success) setExtractedReport(result.data)
      else setExtractionError(result.error.message)
    } catch {
      setExtractionError('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsExtracting(false)
    }
  }

  async function generateReport(): Promise<void> {
    const text = description.trim()
    if (!text || !selectedTemplateId || isGenerating) return
    setIsGenerating(true)
    setGenerationProgress({
      stage: 'extracting',
      message: 'Iniciando a geração do relatório...',
      completedSections: 0,
      totalSections: 0,
      sectionName: null,
    })
    setGenerationError('')
    setGeneratedReport(null)
    setExportMessage('')
    setMissingInformation([])
    try {
      const result = await aiService.generateReport({
        text,
        templateId: selectedTemplateId,
      })
      if (result.success && 'requiresInput' in result)
        setMissingInformation(result.missing)
      else if (result.success) setGeneratedReport(result.data)
      else setGenerationError(result.error.message)
    } catch {
      setGenerationError('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsGenerating(false)
      setGenerationProgress(null)
    }
  }

  async function exportReport(): Promise<void> {
    if (!generatedReport || isExporting) return
    setIsExporting(true)
    setExportMessage('')
    try {
      const result = await aiService.exportReportDocx({
        report: generatedReport,
      })
      setExportMessage(
        result.success
          ? `Relatório exportado para ${result.filePath}`
          : result.error.message,
      )
    } catch {
      setExportMessage('Não foi possível comunicar com o processo principal.')
    } finally {
      setIsExporting(false)
    }
  }

  const currentStep: ReportWorkflowStep =
    generatedReport || isGenerating
      ? 4
      : extractedReport || missingInformation.length
        ? 3
        : 2

  return (
    <AppShell activePage={activePage} onNavigate={navigate}>
      {activePage === 'report' ? (
        <div className={styles.workspace}>
          <section className={styles.hero}>
            <div>
              <span className="eyebrow">Fluxo guiado</span>
              <h2>Registre a atividade com clareza.</h2>
              <p>
                Escolha um modelo, descreva os fatos e revise as informações
                identificadas antes de exportar.
              </p>
            </div>
            <WorkflowStepper
              currentStep={currentStep}
              hasTemplate={Boolean(selectedTemplateId)}
            />
          </section>
          <div className={styles.layout}>
            <ReportComposer
              description={description}
              templates={templates}
              selectedTemplateId={selectedTemplateId}
              isExtracting={isExtracting}
              isGenerating={isGenerating}
              generationProgress={generationProgress}
              extractionError={extractionError}
              onDescriptionChange={(value) => {
                setDescription(value)
                resetOutcome()
              }}
              onTemplateChange={(value) => {
                setSelectedTemplateId(value)
                resetOutcome()
              }}
              onExtract={() => void extractInformation()}
              onGenerate={() => void generateReport()}
              onCreateTemplate={() => navigate('templates')}
            />
            <ReportSidebar templateCount={templates.length} />
          </div>
          <ReportOutcome
            report={extractedReport}
            missingInformation={missingInformation}
            generationError={generationError}
            generatedReport={generatedReport}
            isExporting={isExporting}
            exportMessage={exportMessage}
            onExport={() => void exportReport()}
          />
        </div>
      ) : (
        <ReportTemplatesPage />
      )}
    </AppShell>
  )
}

export default App
