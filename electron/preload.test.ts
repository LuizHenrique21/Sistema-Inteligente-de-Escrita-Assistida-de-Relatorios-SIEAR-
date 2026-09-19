import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiearApi } from '../src/types/siear-api'

const electronMocks = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  invoke: vi.fn(),
  on: vi.fn(),
  removeListener: vi.fn(),
}))

vi.mock('electron', () => ({
  contextBridge: { exposeInMainWorld: electronMocks.exposeInMainWorld },
  ipcRenderer: {
    invoke: electronMocks.invoke,
    on: electronMocks.on,
    removeListener: electronMocks.removeListener,
  },
}))

describe('preload de templates', () => {
  let api: SiearApi

  beforeAll(async () => {
    await import('./preload')
    const exposed = electronMocks.exposeInMainWorld.mock.calls[0]?.[1]
    api = exposed as SiearApi
  })

  beforeEach(() => {
    electronMocks.invoke.mockClear()
    electronMocks.on.mockClear()
    electronMocks.removeListener.mockClear()
  })

  it('expõe a API oficial via contextBridge sem expor ipcRenderer', () => {
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      'siear',
      expect.any(Object),
    )
    expect(api.templates).toEqual(
      expect.objectContaining({
        createFromDocument: expect.any(Function),
        onCreationProgress: expect.any(Function),
        getAll: expect.any(Function),
        getById: expect.any(Function),
        update: expect.any(Function),
        confirm: expect.any(Function),
        delete: expect.any(Function),
      }),
    )
    expect(api).not.toHaveProperty('ipcRenderer')
    expect(api.templates).not.toHaveProperty('repository')
    expect(api.templates).not.toHaveProperty('service')
    expect(api.ai.exportReportDocx).toEqual(expect.any(Function))
  })

  it('exporta DOCX somente pelo canal seguro do Main Process', async () => {
    const report = { id: 'report' } as never
    await api.ai.exportReportDocx({ report })
    expect(electronMocks.invoke).toHaveBeenCalledWith('reports:export-docx', {
      report,
    })
  })

  it('invoca somente os canais oficiais esperados', async () => {
    await api.templates.createFromDocument()
    await api.templates.getAll()
    await api.templates.getById('id')
    await api.templates.update({ version: 2 } as never)
    await api.templates.confirm('id')
    await api.templates.delete('id')
    expect(electronMocks.invoke.mock.calls.map((call) => call[0])).toEqual([
      'templates:create-from-document',
      'templates:get-all',
      'templates:get-by-id',
      'templates:update',
      'templates:confirm',
      'templates:delete',
    ])
  })

  it('encaminha somente eventos de progresso válidos e permite remover listener', () => {
    const callback = vi.fn()
    const unsubscribe = api.templates.onCreationProgress(callback)
    expect(electronMocks.on).toHaveBeenCalledWith(
      'templates:creation-progress',
      expect.any(Function),
    )
    const listener = electronMocks.on.mock.calls[0]?.[1] as (
      event: object,
      value: unknown,
    ) => void
    listener({}, { step: 1, message: 'Lendo documento...' })
    listener({}, { step: 0, message: 'Inválido' })
    listener({}, { step: 3, message: 10 })
    listener({}, { step: 8, message: 'Inválido' })
    listener({}, 'objeto arbitrário')
    expect(callback).toHaveBeenCalledOnce()
    expect(callback).toHaveBeenCalledWith({
      step: 1,
      message: 'Lendo documento...',
    })

    unsubscribe()
    expect(electronMocks.removeListener).toHaveBeenCalledWith(
      'templates:creation-progress',
      listener,
    )
  })
})
