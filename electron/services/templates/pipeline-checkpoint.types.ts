export const PIPELINE_CHECKPOINT_SCHEMA_VERSION = 1 as const

export const PIPELINE_CHECKPOINT_STAGES = [
  'extraction',
  'structure',
  'writing',
  'semantic',
  'formatting',
  'consolidation',
] as const

export type PipelineCheckpointStage =
  (typeof PIPELINE_CHECKPOINT_STAGES)[number]

export type PipelineCheckpointStatus = 'running' | 'completed' | 'failed'

export interface PipelineCheckpointIdentity {
  documentHash: string
  templateVersion: number
  stage: PipelineCheckpointStage
  stageVersion: string
  analyzerVersion: string
  promptVersion: string
  model: string
  configurationHash: string
  inputHash: string
}

export interface SafeCheckpointError {
  name: string
  code: string | null
}

export interface PipelineCheckpoint extends PipelineCheckpointIdentity {
  id: string
  schemaVersion: typeof PIPELINE_CHECKPOINT_SCHEMA_VERSION
  resultHash: string | null
  result: unknown | null
  status: PipelineCheckpointStatus
  error: SafeCheckpointError | null
  createdAt: string
  updatedAt: string
}

export interface PipelineCheckpointRepository {
  getById(id: string): Promise<PipelineCheckpoint | null>
  save(checkpoint: PipelineCheckpoint): Promise<void>
  delete(id: string): Promise<void>
}
