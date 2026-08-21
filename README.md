# SIEAR

Sistema Inteligente de Escrita Assistida de Relatórios.

Fundação técnica em Electron, React, TypeScript e Vite. Ollama, SQLite e documentos ainda não foram implementados.

## Uso

```bash
npm install
npm run dev
```

- `npm run build`: gera as builds.
- `npm run lint`: executa o ESLint.
- `npm run format`: formata com Prettier.
- `npm run typecheck`: valida o TypeScript.
- `npm run dist`: gera o instalador em `release/`.

## Arquitetura

- `src/`: Renderer React sem acesso ao Node.js.
- `electron/main.ts`: processo principal.
- `electron/preload.ts`: ponte segura `window.siear`.
- `electron/ipc/`: handlers IPC por domínio.
- `src/types/siear-api.ts`: contrato compartilhado e tipado.

Fluxo: `React → window.siear.app.getInfo() → preload → ipcRenderer → Main Process`.

Serviços futuros poderão ser adicionados em `electron/services/` e expostos somente por IPC.
