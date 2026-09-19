export type LogLevel = 'debug' | 'info' | 'warn' | 'error'
export type LogMetadata = Record<string, unknown>

export interface LogContext extends LogMetadata {
  context?: string
  operation?: string
  requestId?: string
  correlationId?: string
}

export interface SerializedLogError {
  name: string
  message: string
  stack?: string
  code?: string
}

export interface LogEntry {
  timestamp: string
  level: LogLevel
  message: string
  metadata: LogMetadata
}

export interface LogTransport {
  write(entry: LogEntry): void
}

export interface LogTimer {
  end(message?: string, metadata?: LogMetadata): number
}

export interface Logger {
  debug(message: string, metadata?: LogMetadata): void
  info(message: string, metadata?: LogMetadata): void
  warn(message: string, metadata?: LogMetadata): void
  error(message: string, metadata?: LogMetadata): void
  child(context: LogContext): Logger
  startTimer(operation: string, metadata?: LogMetadata): LogTimer
}
