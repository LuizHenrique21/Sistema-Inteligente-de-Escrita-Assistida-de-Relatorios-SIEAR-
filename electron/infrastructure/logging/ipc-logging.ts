import { randomUUID } from 'node:crypto'
import { serializeError } from './log-sanitizer'
import { runWithLogContext } from './logger'
import type { Logger } from './logger.types'

function controlledFailureCode(result: unknown): string | undefined {
  if (typeof result !== 'object' || result === null || !('success' in result))
    return undefined
  if ((result as { success?: unknown }).success !== false) return undefined
  const error = (result as { error?: unknown }).error
  if (typeof error !== 'object' || error === null || !('code' in error))
    return 'UNKNOWN'
  const code = (error as { code?: unknown }).code
  return typeof code === 'string' ? code : 'UNKNOWN'
}

export function withIpcLogging<TArgs extends unknown[], TResult>(
  channel: string,
  logger: Logger,
  handler: (...args: TArgs) => TResult | Promise<TResult>,
  createId: () => string = randomUUID,
): (...args: TArgs) => Promise<TResult> {
  return async (...args) => {
    const requestId = createId()
    return runWithLogContext(
      { requestId, correlationId: requestId, operation: channel },
      async () => {
        const timer = logger.startTimer('IPC request', { channel })
        logger.info('IPC request started', { channel })
        try {
          const result = await handler(...args)
          const failureCode = controlledFailureCode(result)
          if (failureCode) {
            logger.error('IPC request returned controlled failure', {
              channel,
              errorCode: failureCode,
            })
          }
          timer.end('IPC request completed', { channel })
          return result
        } catch (error: unknown) {
          logger.error('IPC request failed', {
            channel,
            error: serializeError(error),
          })
          throw error
        }
      },
    )
  }
}
