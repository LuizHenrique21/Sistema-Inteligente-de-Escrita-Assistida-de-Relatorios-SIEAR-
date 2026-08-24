# Checkpoints do pipeline de templates

O pipeline oficial de criação de `ReportTemplate` usa checkpoints persistentes e versionados no mesmo SQLite da aplicação. Não existe banco ou fluxo V2 paralelo.

## Identidade

Cada ID é o SHA-256 determinístico de:

- hash SHA-256 do DOCX;
- etapa;
- versão do resultado da etapa;
- versão do analyzer;
- versão do prompt;
- modelo Ollama;
- hash da configuração relevante;
- hash dos resultados usados como entrada.

Uma alteração em qualquer componente relevante produz outro ID e impede a reutilização. As etapas são `extraction`, `structure`, `writing`, `semantic`, `formatting` e `consolidation`.

As constantes de versão ficam junto ao analyzer, prompt ou builder correspondente e devem ser incrementadas quando seu comportamento ou contrato mudar. Configurações que afetam o resultado, como o tamanho dos lotes da análise de escrita, participam do hash de configuração.

Antes de executar, a linha é salva como `running`. Somente um resultado integralmente serializado, validado e com `resultHash` correto passa a `completed`. Falhas são `failed`, sem resultado parcial e contendo apenas nome e código seguros do erro.

## Persistência e retomada

A migration `002-create-pipeline-checkpoints` cria `pipeline_checkpoints` no `siear.sqlite3` armazenado no diretório `userData` do Electron. Checkpoints anteriores permanecem válidos quando uma etapa posterior falha. Entradas `running`, `failed`, corrompidas, incompatíveis ou estruturalmente inválidas são ignoradas.

Falhas da infraestrutura de checkpoint não bloqueiam o pipeline funcional. O sistema executa a etapa normalmente e registra um aviso seguro no backend.

## Benchmark opt-in

```powershell
$env:SIEAR_BENCHMARK_DOCX='C:\caminho\modelo.docx'
$env:SIEAR_BENCHMARK_FIXTURE_ID='relatorio-realista'
npm.cmd run benchmark:checkpoint
```

O benchmark executa o mesmo arquivo duas vezes usando um banco temporário e não faz parte de `npm.cmd test`.

No baseline de 24/08/2026, com DOCX de 3.464.968 bytes e `qwen3:8b`:

| Medição | Primeira tentativa | Retomada |
| --- | ---: | ---: |
| Duração | 348.765,29 ms | 202.200,32 ms |
| Chamadas Ollama | 3 | 1 |
| Extração executada | 1 | 0 |
| Estrutura executada | 1 | 0 |
| Escrita executada | 1 | 1 |

Economia observada: **146.564,97 ms (42,02%)**.

As duas tentativas terminaram com `INVALID_WRITING_ANALYSIS`. Esse resultado confirma a retomada de `extraction` e `structure`, mas não constitui baseline de um pipeline integralmente bem-sucedido. A etapa de escrita falhou e, corretamente, foi executada novamente.
