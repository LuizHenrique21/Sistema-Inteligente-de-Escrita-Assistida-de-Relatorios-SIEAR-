import electronLog from 'electron-log/main'
import type { LogEntry, LogLevel, LogTransport } from './logger.types'

export function configureElectronLog(level: LogLevel): void {
  electronLog.initialize()
  if (process.env.NODE_ENV === 'test') {
    electronLog.transports.file.level = false
    electronLog.transports.console.level = false
    return
  }
  electronLog.transports.file.level = level
  electronLog.transports.file.maxSize = 5 * 1024 * 1024
  electronLog.transports.console.level =
    process.env.NODE_ENV === 'production' ? 'info' : level
  electronLog.transports.file.format =
    '{y}-{m}-{d} {h}:{i}:{s}.{ms} [{level}] {text}'
}

export class ElectronLogTransport implements LogTransport {
  write(entry: LogEntry): void {
    electronLog[entry.level](JSON.stringify(entry))
  }
}
