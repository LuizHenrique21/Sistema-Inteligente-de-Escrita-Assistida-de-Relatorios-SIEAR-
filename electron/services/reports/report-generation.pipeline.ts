import type {
  GenerateReportResult,
  ReportGenerationProgress,
  StructuredActivity,
} from '../../../src/types/generated-report'
import { getLogger } from '../../infrastructure/logging/logger.runtime'
import { serializeError } from '../../infrastructure/logging/log-sanitizer'

const logger = getLogger('ReportGenerationPipeline')
import type { ReportTemplate } from '../../../src/domain/templates/report-template'
import type {
  GeneratedReport,
  ReportGenerationPlan,
} from '../../../src/types/generated-report'

export interface PipelineInformationExtractor {
  extract(text: string, template: ReportTemplate): Promise<StructuredActivity>
}

export interface PipelineGenerationPlanner {
  plan(
    information: StructuredActivity,
    template: ReportTemplate,
  ): ReportGenerationPlan
}

export interface PipelineReportWriter {
  generate(
    information: StructuredActivity,
    plan: ReportGenerationPlan,
    template: ReportTemplate,
    onProgress?: (progress: ReportGenerationProgress) => void,
  ): Promise<GeneratedReport>
}

export class ReportGenerationPipeline {
  constructor(
    private readonly extractor: PipelineInformationExtractor,
    private readonly planner: PipelineGenerationPlanner,
    private readonly generator: PipelineReportWriter,
  ) {}

  async generate(
    text: string,
    template: ReportTemplate,
    onProgress?: (progress: ReportGenerationProgress) => void,
  ): Promise<GenerateReportResult> {
    const timer = logger.startTimer('Report generation', {
      templateId: template.metadata.id,
    })
    try {
      onProgress?.({
        stage: 'extracting',
        message: 'Analisando as informações fornecidas...',
        completedSections: 0,
        totalSections: 0,
        sectionName: null,
      })
      const information: StructuredActivity = await this.extractor.extract(
        text,
        template,
      )
      onProgress?.({
        stage: 'planning',
        message: 'Organizando a estrutura do relatório...',
        completedSections: 0,
        totalSections: 0,
        sectionName: null,
      })
      const plan = this.planner.plan(information, template)
      if (plan.missing.length > 0) {
        onProgress?.({
          stage: 'finalizing',
          message: 'Informações prontas para sua revisão.',
          completedSections: 0,
          totalSections: 0,
          sectionName: null,
        })
        timer.end('Report generation requires input', {
          missing: plan.missing.length,
        })
        return {
          success: true,
          requiresInput: true,
          structuredActivity: information,
          missing: plan.missing,
          questions: plan.missing.map((item) => item.question),
        }
      }
      const data = onProgress
        ? await this.generator.generate(information, plan, template, onProgress)
        : await this.generator.generate(information, plan, template)
      onProgress?.({
        stage: 'finalizing',
        message: 'Finalizando o relatório...',
        completedSections: plan.sections.length,
        totalSections: plan.sections.length,
        sectionName: null,
      })
      timer.end('Report generation completed', {
        sections: data.sections.length,
      })
      return { success: true, data }
    } catch (error: unknown) {
      logger.error('Report generation failed', {
        error: serializeError(error),
      })
      throw error
    }
  }
}
