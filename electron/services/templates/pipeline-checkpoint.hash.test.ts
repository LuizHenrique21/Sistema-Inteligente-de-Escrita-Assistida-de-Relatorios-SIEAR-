import { describe, expect, it } from 'vitest'
import { checkpointId } from './pipeline-checkpoint.hash'
import type { PipelineCheckpointIdentity } from './pipeline-checkpoint.types'

const identity: PipelineCheckpointIdentity = {
  documentHash: 'document-a',
  templateVersion: 2,
  stage: 'writing',
  stageVersion: '1',
  analyzerVersion: '1',
  promptVersion: '1',
  model: 'qwen3:8b',
  configurationHash: 'configuration-a',
  inputHash: 'input-a',
}

describe('identidade do pipeline checkpoint', () => {
  it.each([
    ['documentHash', 'document-b'],
    ['templateVersion', 3],
    ['stageVersion', '2'],
    ['analyzerVersion', '2'],
    ['promptVersion', '2'],
    ['model', 'outro-modelo'],
    ['configurationHash', 'configuration-b'],
    ['inputHash', 'input-b'],
  ] satisfies Array<
    [keyof PipelineCheckpointIdentity, PipelineCheckpointIdentity[keyof PipelineCheckpointIdentity]]
  >)(
    'muda o ID quando %s muda',
    (property, value) => {
      const changed = { ...identity, [property]: value }
      expect(checkpointId(changed)).not.toBe(checkpointId(identity))
    },
  )
})
