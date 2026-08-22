import { readdirSync, readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

function rendererFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name)
    if (entry.isDirectory()) return rendererFiles(entryPath)
    return /\.(ts|tsx)$/.test(entry.name) ? [entryPath] : []
  })
}

describe('limites do Renderer', () => {
  it('não importa Electron nem módulos do Node.js', () => {
    for (const file of rendererFiles('src')) {
      const source = readFileSync(file, 'utf8')
      expect(source, file).not.toMatch(/from ['"]electron['"]/)
      expect(source, file).not.toMatch(/from ['"]node:/)
      expect(source, file).not.toContain('ipcRenderer')
      expect(source, file).not.toMatch(/\brequire\s*\(/)
    }
  })
})
