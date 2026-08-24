import { defineConfig } from 'vite'
import path from 'node:path'

function workerIsolationPlugin() {
  return {
    name: 'siear-worker-isolation',
    enforce: 'pre' as const,
    resolveId(id: string) {
      if (id.includes('logger.runtime')) return '\0siear-worker-logger-stub'
      if (id.includes('electron-log.transport'))
        return '\0siear-worker-electron-log-transport-stub'
      if (id.includes('cpu-bound-worker.host')) return '\0siear-worker-host-stub'
      return null
    },
    load(id: string) {
      if (id === '\0siear-worker-logger-stub')
        return `export function getLogger() {
          return {
            info: () => undefined,
            warn: () => undefined,
            error: () => undefined,
            debug: () => undefined,
            startTimer: () => ({ end: () => undefined }),
          }
        }`
      if (id === '\0siear-worker-electron-log-transport-stub')
        return `export class ElectronLogTransport { write() {} }
          export function configureElectronLog() {}`
      if (id === '\0siear-worker-host-stub')
        return `export async function runCpuWorkerTask() {
          throw new Error('CPU worker host is not available inside CPU workers.')
        }`
      return null
    },
  }
}

export default defineConfig({
  configFile: false,
  logLevel: 'silent',
  plugins: [workerIsolationPlugin()],
  ssr: {
    noExternal: true,
  },
  build: {
    ssr: path.resolve('electron/services/workers/cpu-bound.worker.ts'),
    outDir: 'dist-electron',
    emptyOutDir: false,
    rollupOptions: {
      output: {
        entryFileNames: 'cpu-bound.worker.mjs',
        format: 'esm',
        banner:
          "import { fileURLToPath as __siearFileURLToPath } from 'node:url'; import { dirname as __siearDirname } from 'node:path'; const __filename = __siearFileURLToPath(import.meta.url); const __dirname = __siearDirname(__filename);",
      },
    },
  },
})
