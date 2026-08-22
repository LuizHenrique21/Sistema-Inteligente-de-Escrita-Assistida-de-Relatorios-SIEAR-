import { contextBridge, ipcRenderer } from 'electron'
import type { SiearApi } from '../src/types/siear-api'
import type { TemplateImportProgress } from '../src/types/template-import'

function isTemplateImportProgress(
  value: unknown,
): value is TemplateImportProgress {
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return false
  const item = value as Record<string, unknown>
  return (
    typeof item.step === 'number' &&
    Number.isInteger(item.step) &&
    item.step >= 1 &&
    item.step <= 7 &&
    typeof item.message === 'string'
  )
}

const siearApi: SiearApi = {
  app: { getInfo: () => ipcRenderer.invoke('app:get-info') },
  ai: {
    generate: (request) => ipcRenderer.invoke('ai:generate', request),
    extractReportInformation: (request) =>
      ipcRenderer.invoke('ai:extract-report-information', request),
    generateReport: (request) =>
      ipcRenderer.invoke('ai:generate-report', request),
  },
  templates: {
    getAll: () => ipcRenderer.invoke('templates:get-all'),
    getById: (id) => ipcRenderer.invoke('templates:get-by-id', id),
    create: (template) => ipcRenderer.invoke('templates:create', template),
    update: (id, template) =>
      ipcRenderer.invoke('templates:update', id, template),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
  },
  documents: {
    selectAndAnalyzeTemplate: () =>
      ipcRenderer.invoke('documents:select-and-analyze-template'),
    onTemplateImportProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
        if (isTemplateImportProgress(value)) callback(value)
      }
      ipcRenderer.on('documents:template-import-progress', listener)
      return () =>
        ipcRenderer.removeListener(
          'documents:template-import-progress',
          listener,
        )
    },
  },
}

contextBridge.exposeInMainWorld('siear', siearApi)
