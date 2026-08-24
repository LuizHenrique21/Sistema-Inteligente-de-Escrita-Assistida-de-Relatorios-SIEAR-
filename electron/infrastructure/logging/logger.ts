import { AsyncLocalStorage } from 'node:async_hooks'
import { performance } from 'node:perf_hooks'
import { sanitizeLogMetadata } from './log-sanitizer'
import type {
  LogContext,
  LogEntry,
  Logger,
  LogLevel,
  LogMetadata,
  LogTransport,
} from './logger.types'

const weights: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
}
export const logContext = new AsyncLocalStorage<LogContext>()

export class StructuredLogger implements Logger {
  constructor(
    private readonly transport: LogTransport,
    private readonly minimumLevel: LogLevel = 'info',
    private readonly fixedContext: LogContext = {},
    private readonly now: () => string = () => new Date().toISOString(),
  ) {}

  debug(message: string, metadata?: LogMetadata): void {
    this.write('debug', message, metadata)
  }
  info(message: string, metadata?: LogMetadata): void {
    this.write('info', message, metadata)
  }
  warn(message: string, metadata?: LogMetadata): void {
    this.write('warn', message, metadata)
  }
  error(message: string, metadata?: LogMetadata): void {
    this.write('error', message, metadata)
  }

  child(context: LogContext): Logger {
    return new StructuredLogger(
      this.transport,
      this.minimumLevel,
      { ...this.fixedContext, ...context },
      this.now,
    )
  }

  startTimer(operation: string, metadata: LogMetadata = {}) {
    const started = performance.now()
    this.debug(`${operation} started`, { operation, ...metadata })
    return {
      end: (message = `${operation} completed`, extra: LogMetadata = {}) => {
        const durationMs = Math.round((performance.now() - started) * 100) / 100
        this.info(message, { operation, durationMs, ...metadata, ...extra })
        return durationMs
      },
    }
  }

  private write(
    level: LogLevel,
    message: string,
    metadata: LogMetadata = {},
  ): void {
    if (weights[level] < weights[this.minimumLevel]) return
    const ambient = logContext.getStore() ?? {}
    const entry: LogEntry = {
      timestamp: this.now(),
      level,
      message,
      metadata: sanitizeLogMetadata({
        ...ambient,
        ...this.fixedContext,
        ...metadata,
      }),
    }
    this.transport.write(entry)
  }
}

export function runWithLogContext<T>(context: LogContext, work: () => T): T {
  return logContext.run({ ...(logContext.getStore() ?? {}), ...context }, work)
}
