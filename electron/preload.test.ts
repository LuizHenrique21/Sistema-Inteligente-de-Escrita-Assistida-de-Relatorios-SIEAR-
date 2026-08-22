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

describe('preload de templates V2', () => {
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

  it('expõe a API V2 via contextBridge sem expor ipcRenderer', () => {
    expect(electronMocks.exposeInMainWorld).toHaveBeenCalledWith(
      'siear',
      expect.any(Object),
    )
    expect(api.templatesV2).toEqual(
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
    expect(api.templatesV2).not.toHaveProperty('repository')
    expect(api.templatesV2).not.toHaveProperty('service')
  })

  it('invoca somente os canais V2 esperados', async () => {
    const request = { filePath: 'modelo.docx' }
    await api.templatesV2.createFromDocument(request)
    await api.templatesV2.getAll()
    await api.templatesV2.getById('id')
    await api.templatesV2.update({ version: 2 } as never)
    await api.templatesV2.confirm('id')
    await api.templatesV2.delete('id')
    expect(electronMocks.invoke.mock.calls.map((call) => call[0])).toEqual([
      'templates-v2:create-from-document',
      'templates-v2:get-all',
      'templates-v2:get-by-id',
      'templates-v2:update',
      'templates-v2:confirm',
      'templates-v2:delete',
    ])
  })

  it('encaminha somente eventos de progresso válidos e permite remover listener', () => {
    const callback = vi.fn()
    const unsubscribe = api.templatesV2.onCreationProgress(callback)
    expect(electronMocks.on).toHaveBeenCalledWith(
      'templates-v2:creation-progress',
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
      'templates-v2:creation-progress',
      listener,
    )
  })
})
