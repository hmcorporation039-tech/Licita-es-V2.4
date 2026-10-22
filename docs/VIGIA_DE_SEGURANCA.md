# Vigia de segurança

Monitor **defensivo** e **somente leitura** do banco de produção. Não escreve nada,
não entra em produção, não depende do serviço da API estar no ar. Roda no PC do
Márcio, do mesmo jeito que o backup, lendo o banco pela porta pública do Postgres.

## O que ele confere

| Seção | O que acusa | Severidade |
|---|---|---|
| Contas administradoras | Admin criado dentro da janela; mais admins que o esperado | 🔴 / 🟡 |
| Ações sensíveis | `USUARIO_CRIADO`, `USUARIO_ALTERADO`, `PLANO_ALTERADO`, `PLANO_EMPRESA_ALTERADO`, `SENHA_REDEFINIDA_ADMIN`, `ADMIN_EXPORTOU_AUDITORIA` | 🟡 |
| Login que falhou | IP ou e-mail com muitas falhas (força bruta) | 🟡 |
| Login de admin de IP novo | Admin entrando de um IP que nunca apareceu antes | 🔴 |
| Conexões ao banco | Conexão de IP **externo** (fora das faixas privadas) via `pg_stat_activity` | 🟡 |
| Erros e workers | Salto de erros em relação ao período anterior; workers com falha | 🟡 |

A severidade geral é a pior das seções. O processo sai com código `0` (ok),
`1` (atenção), `2` (crítico) ou `3` (falha ao rodar), para um agendador decidir
quando avisar.

## Como rodar

```bash
npm run vigia
```

Lê `BACKUP_DATABASE_URL` de `scripts/ops/.env.backup` (o mesmo arquivo do backup,
via carregador de env — ninguém imprime o conteúdo). A primeira coisa que faz é
`SET SESSION CHARACTERISTICS AS TRANSACTION READ ONLY`.

Saída em JSON (para o agendador):

```bash
npm run vigia -- --json
```

## Ajustes por variável de ambiente

| Variável | Padrão | Para quê |
|---|---|---|
| `VIGIA_HORAS` | `24` | Tamanho da janela analisada |
| `VIGIA_ADMINS_ESPERADOS` | `3` | Quantos admins são esperados |
| `VIGIA_FALHAS_IP` | `10` | Falhas no mesmo IP que acendem alerta |
| `VIGIA_FALHAS_ALVO` | `8` | Falhas no mesmo e-mail que acendem alerta |
| `VIGIA_PISO_ERROS` | `30` | Piso de erros antes de considerar salto |

## Deixar ligado

No Windows, Agendador de Tarefas rodando a cada 6 horas:

```
powershell -NoProfile -Command "cd 'C:\Users\marci\Downloads\Licita-es-V2.4-main\Licita-es-V2.4-main'; npm run vigia *>> 'C:\Licitações\vigia.log'"
```

O log guarda o histórico; qualquer linha com `CRITICO` é o que olhar primeiro.

## Limites conhecidos

- `pg_stat_activity` só mostra o IP de origem quando o usuário do banco tem
  permissão; sem ela, a seção de conexões avisa e segue.
- A base do "IP novo" é todo o histórico de `LOGIN_OK` anterior à janela. Numa
  janela muito larga (ex.: 720h), com pouco histórico antes dela, logins legítimos
  podem aparecer como "novos". Para o uso diário (24h) isso não acontece.
- A lógica pura (classificação de IP, força bruta, severidade) está em
  `src/lib/vigiaDeSeguranca.ts`, coberta por `tests/vigiaDeSeguranca.test.ts`.
