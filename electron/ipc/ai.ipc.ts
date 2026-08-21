import { ipcMain } from 'electron'
import { OllamaService } from '../services/ollama/ollama.service'
import { createAiGenerateHandler } from './ai.handler'

const ollamaService = new OllamaService()
const generate = createAiGenerateHandler(ollamaService)

export function registerAiIpc(): void {
  ipcMain.handle('ai:generate', (_event, request: unknown) => generate(request))
}
