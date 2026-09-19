import { REPORT_TEMPLATE_VERSION } from '../../../src/domain/templates/report-template'
import {
  SEMANTIC_ANALYZER_VERSION,
  SEMANTIC_PATTERN_STAGE_VERSION,
} from '../ai/semantic-analysis.service'
import {
  WRITING_ANALYZER_VERSION,
  WRITING_PATTERN_STAGE_VERSION,
} from '../ai/writing-analysis.service'
import { SEMANTIC_ANALYSIS_PROMPT_VERSION } from '../ai/prompts/semantic-analysis.prompt'
import { STRUCTURE_ANALYSIS_PROMPT_VERSION } from '../ai/prompts/structure-analysis.prompt'
import {
  WRITING_ANALYSIS_CONTEXT_LIMIT_CHARS,
  WRITING_ANALYSIS_PROMPT_VERSION,
  WRITING_ANALYSIS_SECTION_LIMIT_CHARS,
} from '../ai/prompts/writing-analysis.prompt'
import {
  DOCUMENT_EXTRACTION_ANALYZER_VERSION,
  DOCUMENT_REPRESENTATION_STAGE_VERSION,
} from '../documents/document-extractor.service'
import {
  FORMATTING_ANALYZER_VERSION,
  FORMATTING_PATTERN_STAGE_VERSION,
} from '../documents/formatting-analysis.service'
import {
  STRUCTURE_ANALYZER_VERSION,
  STRUCTURE_PATTERN_STAGE_VERSION,
} from '../documents/structure-analysis.service'
import { REPORT_TEMPLATE_BUILDER_VERSION } from './report-template.builder'
import { hashCheckpointResult } from './pipeline-checkpoint.hash'
import type { PipelineCheckpointStage } from './pipeline-checkpoint.types'

export interface PipelineStageCompatibility {
  stageVersion: string
  analyzerVersion: string
  promptVersion: string
  model: string
  configurationHash: string
}

export type PipelineCheckpointCompatibility = Record<
  PipelineCheckpointStage,
  PipelineStageCompatibility
>

function configurationHash(configuration: Record<string, unknown>): string {
  return hashCheckpointResult(configuration)
}

export function createPipelineCheckpointCompatibility(
  ollamaModel: string,
): PipelineCheckpointCompatibility {
  const structuredOllama = configurationHash({ structuredJson: true })
  return {
    extraction: {
      stageVersion: DOCUMENT_REPRESENTATION_STAGE_VERSION,
      analyzerVersion: DOCUMENT_EXTRACTION_ANALYZER_VERSION,
      promptVersion: 'not-applicable',
      model: 'not-applicable',
      configurationHash: configurationHash({ acceptedFormat: 'docx' }),
    },
    structure: {
      stageVersion: STRUCTURE_PATTERN_STAGE_VERSION,
      analyzerVersion: STRUCTURE_ANALYZER_VERSION,
      promptVersion: STRUCTURE_ANALYSIS_PROMPT_VERSION,
      model: ollamaModel,
      configurationHash: structuredOllama,
    },
    writing: {
      stageVersion: WRITING_PATTERN_STAGE_VERSION,
      analyzerVersion: WRITING_ANALYZER_VERSION,
      promptVersion: WRITING_ANALYSIS_PROMPT_VERSION,
      model: ollamaModel,
      configurationHash: configurationHash({
        structuredJson: true,
        maxBatchCharacters: WRITING_ANALYSIS_CONTEXT_LIMIT_CHARS,
        maxSectionCharacters: WRITING_ANALYSIS_SECTION_LIMIT_CHARS,
        stableSectionIds: true,
      }),
    },
    semantic: {
      stageVersion: SEMANTIC_PATTERN_STAGE_VERSION,
      analyzerVersion: SEMANTIC_ANALYZER_VERSION,
      promptVersion: SEMANTIC_ANALYSIS_PROMPT_VERSION,
      model: ollamaModel,
      configurationHash: structuredOllama,
    },
    formatting: {
      stageVersion: FORMATTING_PATTERN_STAGE_VERSION,
      analyzerVersion: FORMATTING_ANALYZER_VERSION,
      promptVersion: 'not-applicable',
      model: 'not-applicable',
      configurationHash: configurationHash({ source: 'docx-structure' }),
    },
    consolidation: {
      stageVersion: String(REPORT_TEMPLATE_VERSION),
      analyzerVersion: REPORT_TEMPLATE_BUILDER_VERSION,
      promptVersion: 'not-applicable',
      model: 'not-applicable',
      configurationHash: configurationHash({ preserveRichPatterns: true }),
    },
  }
}
