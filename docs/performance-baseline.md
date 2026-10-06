# Baseline de desempenho

Este documento registra o baseline da Fase 1 de otimização do SIEAR. O benchmark não altera o comportamento funcional e executa o pipeline real sequencialmente.

## Como executar

O benchmark é separado da suíte padrão porque utiliza um DOCX real e o Ollama local:

```powershell
$env:SIEAR_BENCHMARK_DOCX='C:\caminho\modelo.docx'
npm.cmd run benchmark:baseline
```

Os relatórios JSON são gravados em `benchmark-results/`, diretório ignorado pelo Git. É possível alterar o destino com `SIEAR_BENCHMARK_OUTPUT`. O identificador seguro da fixture pode ser definido por `SIEAR_BENCHMARK_FIXTURE_ID`; o nome e o caminho locais do arquivo não são persistidos.

O arquivo real de benchmark não usa os sufixos `.test.ts` ou `.spec.ts` e só é incluído por `vitest.baseline.config.ts`. Portanto, `npm.cmd test` não executa o DOCX real nem acessa o Ollama.

## Arquitetura das métricas

Cada medição contém `operationId`, `requestId` (ou `null`), timestamp, etapa, duração, estado, tamanhos de entrada/saída e heap nas fronteiras. Chamadas ao Ollama acrescentam contagens de caracteres e, quando fornecidos pelo servidor, tokens e durações de avaliação. Ausência de dados é representada por `null`, nunca por valores inventados.

As métricas armazenam somente números, identificadores técnicos e códigos de erro controlados. Conteúdo do DOCX, prompts, respostas, caminhos completos, mensagens de erro e stack traces não fazem parte do relatório.

## Fixture representativa

- Identificador seguro: `local-docx`
- Tamanho: 3.464.968 bytes
- SHA-256: `cd1be40127d84cc808055eabd1038d54755c0c72760145afa26c4ad83152f851`
- O documento não é copiado nem armazenado no repositório.

## Ambiente do baseline

- Data: 24/08/2026
- Sistema: Windows x64
- Node.js: 22.18.0
- CPU: AMD Ryzen 7 7700X, 16 processadores lógicos
- RAM total: 33.514.983.424 bytes
- Modelo: `qwen3:8b`

## Resultado inicial

O pipeline falhou de forma controlada em `WritingAnalysis` com `INVALID_WRITING_ANALYSIS`. A falha faz parte do baseline de confiabilidade.

| Métrica                             |                       Resultado |
| ----------------------------------- | ------------------------------: |
| Duração total                       |                      706.067 ms |
| Extração DOCX                       |                          165 ms |
| Estrutura                           |                       36.641 ms |
| Escrita até a falha                 |                      669.261 ms |
| Chamadas ao Ollama                  |                               5 |
| Caracteres de prompt                |                          32.168 |
| Caracteres de resposta              |                         146.760 |
| Tokens de prompt                    |                          12.330 |
| Tokens gerados                      |                          36.961 |
| Velocidade observada                | aproximadamente 60–62 tokens/s |
| Heap antes                          |                16.667.104 bytes |
| Maior heap observado nas fronteiras |                42.228.744 bytes |
| RSS antes/depois                    |   67.579.904 / 79.106.048 bytes |
| Event loop médio / p99 / máximo     |        30,90 / 32,10 / 66,26 ms |
| `structuredClone` até a falha       |                      5 chamadas |

As etapas semântica, formatação, consolidação e SQLite não foram alcançadas e aparecem como `not-reached`, com valores não disponíveis em `null`. IPC, geração e renderização estão fora do fluxo deste benchmark e aparecem explicitamente como `not-measured`.

## Interpretação

- A extração representa menos de 0,1% do tempo observado.
- A escrita representa aproximadamente 94,8% do tempo total.
- O custo dominante foi geração: os últimos lotes produziram 12.128 e 16.189 tokens.
- O baseline comprova que a implementação experimental de lotes ainda não é aceitável em tempo ou confiabilidade.
- A medição de pico de heap ocorre nas fronteiras das etapas. Um profiler com amostragem contínua ainda será necessário para determinar o pico transitório durante parsing e serialização.

Este baseline deve ser preservado para comparação. Uma otimização de IA somente será aceita após golden tests demonstrarem equivalência de estrutura, evidências, escrita e semântica.
