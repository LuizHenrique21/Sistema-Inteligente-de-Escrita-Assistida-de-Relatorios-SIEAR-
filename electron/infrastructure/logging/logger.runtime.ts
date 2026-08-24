import {
  ElectronLogTransport,
  configureElectronLog,
} from './electron-log.transport'
import { StructuredLogger } from './logger'
import type { Logger, LogLevel } from './logger.types'

function configuredLevel(): LogLevel {
  const value = process.env.SIEAR_LOG_LEVEL?.toLocaleLowerCase()
  return value === 'debug' || value === 'warn' || value === 'error'
    ? value
    : 'info'
}

const level = configuredLevel()
configureElectronLog(level)
const rootLogger = new StructuredLogger(new ElectronLogTransport(), level)

export function getLogger(context: string): Logger {
  return rootLogger.child({ context })
}
