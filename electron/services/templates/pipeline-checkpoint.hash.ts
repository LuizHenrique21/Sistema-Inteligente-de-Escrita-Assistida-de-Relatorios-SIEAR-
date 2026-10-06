import { createHash } from 'node:crypto'
import { createReadStream } from 'node:fs'
import type { PipelineCheckpointIdentity } from './pipeline-checkpoint.types'

export function sha256(value: string | Uint8Array): string {
  return createHash('sha256').update(value).digest('hex')
}

export function serializeCheckpointResult(value: unknown): string {
  const serialized = JSON.stringify(value)
  if (serialized === undefined)
    throw new TypeError('O resultado do checkpoint não é serializável.')
  return serialized
}

export function hashCheckpointResult(value: unknown): string {
  return sha256(serializeCheckpointResult(value))
}

export function checkpointId(identity: PipelineCheckpointIdentity): string {
  return sha256(
    JSON.stringify([
      identity.documentHash,
      identity.templateVersion,
      identity.stage,
      identity.stageVersion,
      identity.analyzerVersion,
      identity.promptVersion,
      identity.model,
      identity.configurationHash,
      identity.inputHash,
    ]),
  )
}

export function combineCheckpointHashes(...hashes: string[]): string {
  return sha256(JSON.stringify(hashes))
}

export async function hashDocumentFile(filePath: string): Promise<string> {
  const hash = createHash('sha256')
  for await (const chunk of createReadStream(filePath)) {
    if (typeof chunk === 'string') hash.update(chunk)
    else hash.update(chunk as Uint8Array)
  }
  return hash.digest('hex')
}
