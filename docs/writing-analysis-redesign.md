# WritingAnalysis fragmentada

## Escopo e arquitetura

A API `WritingAnalysisService.analyze(document, structure)` continua retornando
`WritingPattern`. O terceiro argumento opcional transporta progresso, cancelamento,
observadores e checkpoints. `ReportTemplate`, SemanticAnalysis e geração não tiveram
seus contratos alterados.

Antes, cada lote de até quatro seções solicitava um WritingPattern inteiro, incluindo
perfil global e sete listas de regras. O resultado global era escolhido por moda
entre lotes. O protótipo intermediário também enfraquecia a validação final.

Agora o fluxo é:

`contexto → global validado → seção validada (uma por vez) → consolidação determinística`

Cada unidade admite uma chamada inicial e no máximo dois reparos. Respostas inválidas
não avançam para a unidade seguinte. Unidades válidas são persistidas antes de avançar.
A validação profunda do WritingPattern final foi preservada em módulo próprio.

## Contratos internos

Global: `{ profile, evidenceIds, rules }`.

Seção: `{ sectionId, profile, evidenceIds, rules }`.

`profile` contém as classificações já existentes no domínio: tom, formalidade,
tecnicidade, objetividade, complexidade de frases, pessoa gramatical, tempo verbal,
voz, uso de primeira/terceira pessoa, detalhe e estilo narrativo. Enums em português
são centralizados em `writing-contract.ts`; schema, prompt e validação usam essa
mesma fonte. String classificatória vazia vira `não identificado`. Campo ausente,
tipo incorreto, objeto/array ausente ou ID vazio continuam inválidos.

Regras possuem `{ kind, rule, justification, evidenceIds }`. `kind` usa as sete
categorias globais existentes ou as três categorias de seção existentes.
O global admite até quatro regras ao todo; uma seção, até três. Regra e justificativa
têm no máximo 120 caracteres cada. Perfis e regras exigem uma ou duas referências.

O validador recursivo cobre exatamente o subconjunto de JSON Schema utilizado:
objetos com chaves exatas, obrigatoriedade, enums, strings não vazias e limitadas,
arrays limitados, IDs únicos e allowlists. Rejeita propriedades desconhecidas,
inclusive aninhadas. Caminhos de erro são gerados apenas a partir de chaves conhecidas;
nomes arbitrários retornados pelo modelo não são copiados para logs.

## Contexto e evidências

O contexto associa IDs determinísticos `section-001` e `section-001-evidence-1` à
ordem das seções agrupadas pela estrutura. São estáveis para a mesma estrutura e
documento, independentemente de UUIDs e timestamps da extração. Alterações de ordem
ou conteúdo invalidam hashes; IDs não são identificadores globais entre documentos.
Nome original é preservado para a saída de domínio; nome canônico usa normalização
determinística de caixa, acentos e pontuação, preservando números de atividades.

O amostrador compartilhado com SemanticAnalysis foi mantido para compatibilidade:
até três amostras por seção, limitadas a 700 caracteres, selecionadas no início/meio/fim
das ocorrências, com mascaramento dos dados comuns já suportados pelo projeto.
O global recebe até seis amostras distribuídas entre seções. Não recebe documento
integral, formatação ou padrões semânticos.

As métricas representam **as amostras selecionadas**, não o documento integral:
quantidade de amostras/parágrafos amostrados e média de palavras. A média global
pondera cada amostra igualmente, sem média cega de médias por seção. Métricas de
frases e frequência de termos não são inferidas nem simuladas.

O modelo devolve IDs; o consolidator resolve os trechos literais das amostras em
memória. Uma referência de outra seção é rejeitada, não reinterpretada ou descartada.
Global só pode referenciar as amostras que efetivamente recebeu. Evidências válidas
são mantidas na saída. Regras globais não são copiadas para todas as seções.

## Retry e erros

Cada resposta é validada imediatamente, antes de checkpoint e consolidação. O reparo
recebe o schema, enums/IDs permitidos, erros `{path, code, allowedValues?}` e o JSON
anterior limitado. Se o JSON não pôde ser lido, recebe novamente somente o pequeno
contexto daquela unidade. Erros de transporte são propagados e não consomem tentativas
de reparo de contrato. Configuração aceita `maxRetries` entre zero e dois.

Erros de global e seção são diferenciados nos eventos de diagnóstico; esgotamento
usa `WRITING_ANALYSIS_RETRY_EXHAUSTED`, cancelamento usa
`WRITING_ANALYSIS_CANCELLED`. IPC continua recebendo `INVALID_WRITING_ANALYSIS`.

## Checkpoints e progresso

Reutiliza o coordenador e a tabela existentes: `stage=writing`, com namespace
`writing-unit` e `scope=global` ou `section-NNN` no hash de entrada. O checkpoint
final de WritingPattern continua separado por sua identidade de entrada.
Não é necessária migration ou banco paralelo.

A chave incorpora hash do DOCX, identidade do contexto, unidade, entradas relevantes,
schema, versões de analyzer e prompts global/seção, configuração de geração e modelo
do coordenador. Analyzer e etapa foram elevados para versão 6; resultados antigos
não são reutilizados. O modelo é identificado pela tag configurada, conforme o
coordenador existente; atualização do conteúdo de uma mesma tag requer invalidação.

Subcheckpoints contêm apenas classificações, regras curtas e IDs, sem amostras,
prompts ou DocumentRepresentation. O checkpoint de extração pré-existente ainda
armazena conteúdo; a política geral de retenção permanece uma questão separada.

Progresso usa os eventos IPC existentes na etapa 3: padrão global, seção X/Y,
correção de seção e consolidação. `AbortSignal` opcional chega a cada chamada e
impede a próxima unidade; a criação de uma UI de cancelamento não faz parte desta
mudança.

## Limites e observabilidade

Somente escrita passa parâmetros por chamada ao Ollama:

| Parâmetro                   | Global | Seção |
| --------------------------- | -----: | ----: |
| `num_predict`               |   1536 |  1024 |
| `temperature`               |      0 |     0 |
| `think`                     |  false | false |
| Resposta aceita, caracteres |  12000 | 12000 |

Os limites acomodam doze classificações e até quatro/três regras curtas com IDs.
Desabilitar a saída de raciocínio nessas classificações mantém o orçamento disponível
para o JSON. O timeout do serviço permanece 300 segundos. Outras chamadas ao Ollama
mantêm seus parâmetros anteriores. Referência: [API chat do Ollama](https://docs.ollama.com/api/chat).

Eventos `WRITING_GLOBAL_ANALYSIS_*`, `WRITING_SECTION_ANALYSIS_*`,
`WRITING_ANALYSIS_CHECKPOINT_REUSED` e `WRITING_ANALYSIS_CONSOLIDATED` registram
escopo técnico, tentativa, duração, tokens e códigos de validação. Não registram
prompts, respostas, amostras ou evidências textuais. A correlação continua herdada
da chamada IPC.

## Integração e estabilidade

```powershell
$env:SIEAR_WRITING_ANALYSIS_DOCX='C:\caminho\referencia.docx'
$env:SIEAR_WRITING_RUNS='5'
npm.cmd run test:integration:writing
```

O comando explícito exige o arquivo e executa extração → estrutura → escrita com
`qwen3:8b`. A suíte comum não chama o Ollama. Cada execução de estabilidade usa cache
novo, valida o WritingPattern completo e verifica uma segunda passagem com zero
chamadas de escrita. Um teste unitário separado valida persistência após reabrir SQLite.

Relatórios seguros em `benchmark-results/writing-stability-*.json` incluem hash da
fixture, versões/configuração, taxa de sucesso, duração total/de escrita, chamadas
globais/de seção, retries, tokens de entrada/saída por unidade, falhas por campo,
evidências inválidas, maior resposta e unidades reutilizadas. Métricas ausentes são
`null`. O relatório é atualizado após cada execução, inclusive falhas.

Comparação histórica disponível: `docs/performance-baseline.md` registra 706.067 ms
no fluxo antigo, 669.261 ms em escrita, cinco chamadas totais, 36.961 tokens gerados
e falha. O log do usuário de 19/09 registra uma chamada de escrita com 256.122 ms,
14.501 tokens e 61.198 caracteres, também falhando. Uma chamada não equivale a uma
execução integral: comparar maior resposta com maior resposta e totais com totais.

Resultados medidos da nova implementação serão registrados após a execução real;
a existência do benchmark e testes com mocks não atesta estabilidade.

## Arquivos e verificação

Arquivos criados:

- `electron/services/ai/writing/writing-context.ts`: identidade, amostras e métricas.
- `electron/services/ai/writing/writing-contract.ts`: contratos, enums, schemas e validação das unidades.
- `electron/services/ai/writing/writing-consolidator.ts`: conversão determinística ao domínio.
- `electron/services/ai/writing/writing-pattern.validation.ts`: validação profunda final extraída da implementação anterior.
- `electron/services/ai/writing/writing-generation.options.ts`: opções de geração por chamada.
- `electron/services/ai/writing-analysis.integration.test.ts`: estabilidade real e retomada.
- `vitest.writing-integration.config.ts`: execução explícita isolada.
- `docs/writing-analysis-redesign.md`: arquitetura, operação e resultados.

Arquivos modificados:

- `electron/services/ai/writing-analysis.service.ts` e seu teste: orquestração global/seções, retry, progresso, checkpoints, cancelamento e regressões.
- `electron/services/ollama/ollama.service.ts` e seu teste: opções opcionais e métricas por chamada; defaults de outros consumidores preservados.
- `electron/services/templates/template-creation.pipeline.ts` e seu teste: encaminhamento de progresso/checkpoints à escrita.
- `electron/services/templates/pipeline-checkpoint.config.ts`: versões e configuração de escrita.
- `package.json`: comando explícito de integração.
- `README.md`: instruções de execução.

Verificação automatizada: 234 testes aprovados e duas integrações opt-in ignoradas
na suíte comum; TypeScript, ESLint e build aprovados. Testes de escrita cobrem
classificações, chaves/tipos/arrays, evidências, global e seção inválidos, reparos,
limite de tentativas, cancelamento, amostragem, consolidação de quatro seções,
preservação das diferenças e retomada após reiniciar SQLite. A cobertura funcional
anterior de amostragem, dados comuns mascarados, agrupamento, títulos numerados e
evidência literal foi preservada/adaptada para os novos contratos.

## Limites de interpretação e próximo passo

Validade estrutural e evidências referenciáveis não garantem que cada inferência
linguística seja correta. Uma revisão humana dos padrões e fixtures de referência
com expectativas linguísticas continua necessária. As métricas são de amostras
truncadas, há no máximo seis amostras globais e os IDs são locais ao contexto.

O benchmark cobre extração, estrutura e escrita; não comprova importação completa,
SemanticAnalysis, exportação ou qualidade dos relatórios gerados. A estrutura pode
ainda depender de inferência e variar de execução para execução. Persistência real
dos subcheckpoints é exercitada em teste com SQLite; o benchmark usa repositório
em memória para isolar cada execução fria e testar reaproveitamento dentro dela.

Próximo passo: revisar a qualidade dos padrões produzidos nesse DOCX e ampliar
fixtures antes de considerar o mesmo redesenho para SemanticAnalysis. Não foram
alteradas regras ou contratos dessa etapa posterior.
