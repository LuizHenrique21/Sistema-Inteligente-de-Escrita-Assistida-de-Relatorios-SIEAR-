# SIEAR

Sistema Inteligente de Escrita Assistida de Relatórios.

Fundação técnica em Electron, React, TypeScript e Vite, com integração local ao Ollama. SQLite e processamento de documentos ainda não foram implementados.

## Uso

```bash
npm install
npm run dev
```

- `npm run build`: gera as builds.
- `npm run lint`: executa o ESLint.
- `npm run format`: formata com Prettier.
- `npm test`: executa todos os testes automatizados uma vez.
- `npm run test:watch`: executa os testes em modo interativo durante o desenvolvimento.
- `npm run typecheck`: valida o TypeScript.
- `npm run dist`: gera o instalador em `release/`.

## Arquitetura

- `src/`: Renderer React sem acesso ao Node.js.
- `electron/main.ts`: processo principal.
- `electron/preload.ts`: ponte segura `window.siear`.
- `electron/ipc/`: handlers IPC por domínio.
- `electron/services/ollama/`: comunicação exclusiva do Main Process com o Ollama.
- `src/types/siear-api.ts`: contrato compartilhado e tipado.

## Ollama

Com o Ollama instalado, prepare o modelo e inicie o serviço local:

```bash
ollama pull qwen3:8b
ollama serve
```

Fluxo da integração:

`React → window.siear.ai.generate() → preload → ai:generate → OllamaService → http://localhost:11434/api/chat`

O Renderer não acessa o endpoint diretamente. URL, modelo e timeout ficam centralizados no serviço do Main Process. Outros serviços futuros devem seguir o mesmo limite arquitetural e ser expostos somente por métodos tipados no preload.
