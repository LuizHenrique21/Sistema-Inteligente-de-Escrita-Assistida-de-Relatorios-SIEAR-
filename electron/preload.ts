import { contextBridge, ipcRenderer } from 'electron'
import type { SiearApi } from '../src/types/siear-api'

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
  },
}

contextBridge.exposeInMainWorld('siear', siearApi)
