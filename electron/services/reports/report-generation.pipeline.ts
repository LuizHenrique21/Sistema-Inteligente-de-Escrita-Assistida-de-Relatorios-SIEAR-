import type {
  GenerateReportResult,
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
  ): Promise<GenerateReportResult> {
    const timer = logger.startTimer('Report generation', {
      templateId: template.metadata.id,
    })
    try {
      const information: StructuredActivity = await this.extractor.extract(
        text,
        template,
      )
      const plan = this.planner.plan(information, template)
      if (plan.missing.length > 0) {
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
      const data = await this.generator.generate(information, plan, template)
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
