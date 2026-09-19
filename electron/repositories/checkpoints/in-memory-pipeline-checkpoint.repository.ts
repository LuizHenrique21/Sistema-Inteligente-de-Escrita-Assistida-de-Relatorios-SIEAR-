import type {
  PipelineCheckpoint,
  PipelineCheckpointRepository,
} from '../../services/templates/pipeline-checkpoint.types'

export class InMemoryPipelineCheckpointRepository
  implements PipelineCheckpointRepository
{
  private readonly checkpoints = new Map<string, PipelineCheckpoint>()

  async getById(id: string): Promise<PipelineCheckpoint | null> {
    const checkpoint = this.checkpoints.get(id)
    return checkpoint ? structuredClone(checkpoint) : null
  }

  async save(checkpoint: PipelineCheckpoint): Promise<void> {
    this.checkpoints.set(checkpoint.id, structuredClone(checkpoint))
  }

  async delete(id: string): Promise<void> {
    this.checkpoints.delete(id)
  }
}
