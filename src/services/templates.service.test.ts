import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import type { SiearApi } from '../types/siear-api'
import type { ReportTemplate } from '../domain/templates/report-template'

const api = {
  createFromDocument: vi.fn(),
  onCreationProgress: vi.fn(),
  getAll: vi.fn(),
  getById: vi.fn(),
  update: vi.fn(),
  confirm: vi.fn(),
  delete: vi.fn(),
}

let templatesService: typeof import('./templates.service').templatesService

beforeAll(async () => {
  Object.defineProperty(globalThis, 'window', {
    configurable: true,
    value: { siear: { templates: api } as unknown as SiearApi },
  })
  templatesService = (await import('./templates.service')).templatesService
})

beforeEach(() => vi.clearAllMocks())

describe('templatesService do Renderer', () => {
  it('encaminha criação e inscrição de progresso pela API segura', async () => {
    api.createFromDocument.mockResolvedValue({
      success: false,
      error: { code: 'CANCELED', message: 'Cancelado' },
    })
    const callback = vi.fn()
    const unsubscribe = vi.fn()
    api.onCreationProgress.mockReturnValue(unsubscribe)

    await expect(templatesService.createFromDocument()).resolves.toMatchObject({
      success: false,
    })
    expect(templatesService.onCreationProgress(callback)).toBe(unsubscribe)
    expect(api.createFromDocument).toHaveBeenCalledWith()
    expect(api.onCreationProgress).toHaveBeenCalledWith(callback)
  })

  it('encaminha listagem, carregamento, atualização, confirmação e exclusão', async () => {
    const snapshot = {
      version: 2,
      metadata: { id: 'id' },
    } as unknown as ReportTemplate
    api.getAll.mockResolvedValue({ success: true, data: [snapshot] })
    api.getById.mockResolvedValue({ success: true, data: snapshot })
    api.update.mockResolvedValue({ success: true, data: snapshot })
    api.confirm.mockResolvedValue({ success: true, data: snapshot })
    api.delete.mockResolvedValue({ success: true, data: null })

    await templatesService.getAll()
    await templatesService.getById('id')
    await templatesService.update(snapshot)
    await templatesService.confirm('id')
    await templatesService.delete('id')

    expect(api.getAll).toHaveBeenCalledOnce()
    expect(api.getById).toHaveBeenCalledWith('id')
    expect(api.update).toHaveBeenCalledWith(snapshot)
    expect(api.confirm).toHaveBeenCalledWith('id')
    expect(api.delete).toHaveBeenCalledWith('id')
  })

  it('preserva respostas de erro sem acessar detalhes Electron', async () => {
    const failure = {
      success: false,
      error: { code: 'NOT_FOUND', message: 'Modelo não encontrado.' },
    }
    api.getById.mockResolvedValue(failure)
    await expect(templatesService.getById('missing')).resolves.toBe(failure)
    expect(templatesService).not.toHaveProperty(['ipc', 'Renderer'].join(''))
    expect(templatesService).not.toHaveProperty('repository')
  })
})
