# SIEAR

Sistema Inteligente de Escrita Assistida de Relatórios.

Aplicação Electron, React, TypeScript e Vite com integração local ao Ollama, aprendizado de modelos a partir de um único DOCX, persistência SQLite, geração estruturada e exportação DOCX.

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
- `electron/services/ai/`: prompts, interpretação e validação de dados estruturados do SIEAR.
- `electron/services/documents/`: extração, análise e renderização de documentos.
- `electron/repositories/templates/`: persistência dos modelos oficiais em SQLite e implementação em memória para testes.
- `src/domain/templates/`: contrato rico e independente de infraestrutura do `ReportTemplate`.
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

## Extração estruturada

A descrição livre é convertida no contrato `ReportInformation` pelo fluxo:

`React → window.siear.ai.extractReportInformation() → IPC → ReportExtractionService → OllamaService → Ollama`

O serviço de extração exige todos os campos do contrato, valida o JSON e rejeita respostas parciais ou com tipos incorretos. Informações ausentes permanecem `null`; atividades permanecem sempre em um array.

O teste de integração com o Ollama real é opt-in. No PowerShell:

```powershell
$env:SIEAR_OLLAMA_INTEGRATION='true'
npm exec vitest run electron/services/ai/report-extraction.integration.test.ts
```

## Modelos de relatório

Os modelos são gerenciados no Main Process por `ReportTemplateService`, apoiado pela abstração `ReportTemplateRepository`. Em produção, `SqliteReportTemplateRepository` persiste integralmente os padrões estruturais, de escrita, semânticos e de formatação. `InMemoryReportTemplateRepository` é reservado aos testes unitários.

Fluxo:

`DOCX → DocumentExtractor → análises estrutural/escrita/semântica/formatação → ReportTemplateBuilder → ReportTemplateService → SQLite`

A interface permite importar um único DOCX, acompanhar a análise, revisar, editar, confirmar, excluir e selecionar o modelo aprendido.

## Geração de relatório

A tela “Novo Relatório” interpreta a descrição como `StructuredActivity`, cria um plano determinístico a partir do modelo selecionado e solicita ao Ollama somente o preenchimento fundamentado das seções.

Fluxo:

`Texto → UserInformationExtractor → StructuredActivity → ReportGenerationPlanner + ReportTemplate → ReportGenerationService → Ollama → GeneratedReport`

O template é buscado no Main Process pelo ID e nunca é aceito do Renderer como fonte confiável. O plano preserva hierarquia, regras de escrita, semântica e formatação. A resposta do Ollama usa JSON Schema, exige evidências fornecidas pelo usuário e é validada antes de chegar à interface.

## Exportação DOCX

O `DocumentRenderer` recebe o `GeneratedReport` e o `ReportTemplate` oficial. A gravação ocorre no Main Process, após seleção segura do destino:

`GeneratedReport + ReportTemplate → DocumentRenderer → reports:export-docx → DOCX`

O Renderer React não acessa Node.js, filesystem, SQLite ou Ollama diretamente; toda comunicação externa passa pelo preload tipado com `contextIsolation: true` e `nodeIntegration: false`.
