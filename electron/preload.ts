import { contextBridge, ipcRenderer } from 'electron'
import type { SiearApi } from '../src/types/siear-api'

const siearApi: SiearApi = {
  app: { getInfo: () => ipcRenderer.invoke('app:get-info') },
  ai: {
    generate: (request) => ipcRenderer.invoke('ai:generate', request),
    extractReportInformation: (request) =>
      ipcRenderer.invoke('ai:extract-report-information', request),
  },
  templates: {
    getAll: () => ipcRenderer.invoke('templates:get-all'),
    getById: (id) => ipcRenderer.invoke('templates:get-by-id', id),
    create: (template) => ipcRenderer.invoke('templates:create', template),
    update: (id, template) =>
      ipcRenderer.invoke('templates:update', id, template),
    delete: (id) => ipcRenderer.invoke('templates:delete', id),
  },
}

contextBridge.exposeInMainWorld('siear', siearApi)
