# Estrategista de Habilitação — desenho antes do código

Funcionalidade pedida pelo sócio (item 8 da auditoria). Depois da disputa, o
portal publica os documentos de habilitação do vencedor/concorrentes. Quem
ficou em 2º lugar pode analisar esses documentos, achar defeitos (documento
faltando, certidão vencida, atestado que não cobre o objeto/quantidade,
inconsistência) e entrar com **recurso** para inabilitar o concorrente. O
Estrategista faz esse trabalho: lê os documentos do concorrente, cruza com as
exigências do edital e redige a minuta do recurso.

## Decisões (tomadas; Márcio pode mudar)

1. **De onde vêm os documentos do concorrente = UPLOAD do usuário.** O sistema
   não automatiza portal (login + CAPTCHA). O cliente baixa os documentos da
   sessão do portal e sobe aqui. (Alternativa "a Bela baixa sozinha" esbarra na
   mesma trava de CAPTCHA do robô — fica para quando houver adaptador de portal
   ao vivo.)
2. **Reusa as exigências que a análise de edital já extraiu** (`TenderAnalysis.
   resultado`: `matrizExigencias`, `documentosExigidos`, `exigenciasTecnicas`, e
   os `alertasDaAnalise`). Exige que a licitação já tenha análise concluída; se
   não tiver, a tela pede para analisar o edital primeiro.
3. **Reusa o pipeline de IA** (fila BullMQ, Gemini analista / Claude revisor,
   prompt e schema no estilo de `src/services/llm/types.ts`). Novo job
   `analisar-concorrente` na fila `analise`. Gated por `AI_ANALYSIS_ENABLED`.
4. **Anti-alucinação:** a IA transcreve LITERAL o trecho do documento do
   concorrente que embasa cada achado; o código confere que o trecho existe
   mesmo (padrão `verificarExigencias` de `matrizExigencias.ts`). Achado sem
   comprovação na fonte é descartado/rebaixado — não se acusa concorrente com
   base inventada.
5. **Custo/cota:** nova etapa `habilitacao-concorrente` em `AiUsage` (medição) e
   uma cota por plano (`analisesDeConcorrenteMes`), no mesmo molde das análises.
6. **Documentos do concorrente são efêmeros:** guardados só para a análise,
   apagados por retenção (ex.: 30 dias após a sessão), não entram no cofre da
   empresa (que é dos documentos PRÓPRIOS).

## Dados (migration aditiva, à mão)

```
model AnaliseDeConcorrente {
  id, companyId, userId, tenderId,
  nomeConcorrente String?        // nome/CNPJ que o usuário digitou (opcional)
  status          AnalysisStatus // reusa o enum (PENDING/RUNNING/DONE/FAILED/NO_DOCUMENTS/DISABLED)
  resultado       Json?          // { achados: AchadoDeHabilitacao[], resumo }
  erro            String?
  createdAt, updatedAt
  arquivos        ConcorrenteArquivo[]
  @@index([companyId, tenderId])
}
model ConcorrenteArquivo {   // bytes no banco, como CompanyDocumentFile
  id, analiseId, companyId, nomeArquivo, mimeType, tamanho, sha256, conteudo Bytes
}
```
Vários concorrentes por licitação (não é único por tender). Isolado por
`companyId`.

`AchadoDeHabilitacao` (resultado da IA, conferido pelo código):
```
{ requisito: string            // exigência do edital
  categoria: 'juridica'|'fiscal'|'economica'|'tecnica'|'proposta'|'outra'
  situacao: 'atende'|'problema'|'faltando'|'duvida'
  gravidade: 'alta'|'media'|'baixa'
  explicacao: string           // por que é defeito
  trechoDoDocumento: string    // transcrição LITERAL (conferida na fonte)
  documento, pagina            // onde no documento do concorrente
  itemDoEdital: string         // cláusula do edital
  fundamento: string           // base legal (Lei 14.133)
  comprovado: boolean          // o código confirmou o trecho na fonte
}
```

## Fatias

- **Fatia 1 — análise (esta entrega):** modelo + upload dos documentos do
  concorrente + job de IA que produz os achados + tela para ver (aba no detalhe
  da licitação, ao lado do Painel do Fiscal). Sem recurso ainda.
- **Fatia 2 — minuta de recurso:** estende `documentosDaLicitacao/modelo.ts`
  com o tipo `'recurso'` e `recursoDeHabilitacao(proponente, certame, achados,
  prazo)` (molde de `impugnacao.ts`), reusa `renderizarPdf/Docx` e a rota
  `/arquivo`. Cita os achados comprovados + base legal + tempestividade (prazo
  de recurso, em regra 3 dias úteis — Lei 14.133 art. 165).

## Verificação

- Orquestração testável com IA FALSA (injeção de dependência, como os testes da
  análise de edital) — não gasta token real no CI.
- `verificarExigencias` garante que todo achado "comprovado" tem trecho real.
- Cota e custo medidos; gated por `AI_ANALYSIS_ENABLED`.
- Integração: upload + isolamento por empresa + status do job.

## Reuso (mapa do código)

- Exigências: `TenderAnalysis.resultado` (`EditalAnalysisResult` em
  `src/services/llm/types.ts`), `alertasDaAnalise` (`src/lib/alertasLegais.ts`).
- Leitura de documento: `extractPdf` (`src/services/pdfTextService.ts`),
  `extrairTextoDeOffice` (`src/services/leitorDeOffice.ts`), `blocosDeDocumento`
  (`src/services/llm/claudeAnalyzer.ts`) para PDF escaneado (multimodal).
- Upload: molde de `src/api/routes/companyDocuments.ts` (`express.raw`,
  `detectarTipoDeArquivo`, sha256).
- IA: `executarPipeline`/`configuracaoDeIa` (`src/services/analiseEmDupla.ts`),
  prompts em `src/services/llm/types.ts`, fila `analiseQueue` + worker
  `src/workers/analise.ts`, cota `exigirCota` (`src/services/quotaService.ts`),
  custo `registrarUsoDeIa` (`src/services/aiUsageService.ts`).
- Verificação literal: `verificarExigencias` (`src/lib/matrizExigencias.ts`).
- Gerador legal (Fatia 2): `src/lib/documentosDaLicitacao/` + renderizadores em
  `src/services/documentos/`.
