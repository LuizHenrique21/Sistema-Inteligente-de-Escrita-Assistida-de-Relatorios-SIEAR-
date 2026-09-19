import { StructuredLogger } from './logger'
import type { LogEntry, Logger, LogLevel, LogTransport } from './logger.types'

class NoopLogTransport implements LogTransport {
  write(): void {
    // Logging is intentionally disabled inside CPU workers and test fallbacks.
  }
}

class DelegatingLogTransport implements LogTransport {
  constructor(private delegate: LogTransport) {}

  setDelegate(delegate: LogTransport): void {
    this.delegate = delegate
  }

  write(entry: LogEntry): void {
    this.delegate.write(entry)
  }
}

function configuredLevel(): LogLevel {
  const value = process.env.SIEAR_LOG_LEVEL?.toLocaleLowerCase()
  return value === 'debug' || value === 'warn' || value === 'error'
    ? value
    : 'info'
}

const level = configuredLevel()
const transport = new DelegatingLogTransport(new NoopLogTransport())
if (process.env.SIEAR_CPU_WORKER !== '1' && process.env.NODE_ENV !== 'test') {
  void import('./electron-log.transport')
    .then(({ ElectronLogTransport, configureElectronLog }) => {
      configureElectronLog(level)
      transport.setDelegate(new ElectronLogTransport())
    })
    .catch(() => {
      transport.setDelegate(new NoopLogTransport())
    })
}
const rootLogger = new StructuredLogger(transport, level)

export function getLogger(context: string): Logger {
  return rootLogger.child({ context })
}
