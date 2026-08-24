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
    exportReportDocx: (request) =>
      ipcRenderer.invoke('reports:export-docx', request),
  },
  templates: {
    createFromDocument: () =>
      ipcRenderer.invoke('templates:create-from-document'),
    onCreationProgress: (callback) => {
      const listener = (_event: Electron.IpcRendererEvent, value: unknown) => {
        if (isTemplateImportProgress(value)) callback(value)
      }
      ipcRenderer.on('templates:creation-progress', listener)
      return () =>
        ipcRenderer.removeListener('templates:creation-progress', listener)
    },
    getAll: () => ipcRenderer.invoke('templates:get-all'),
    getById: (id) => ipcRenderer.invoke('templates:get-by-id', id),
    update: (template) => ipcRenderer.invoke('templates:update', template),
    confirm: (id) => ipcRenderer.invoke('templates:confirm', id),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
  },
}

contextBridge.exposeInMainWorld('siear', siearApi)
