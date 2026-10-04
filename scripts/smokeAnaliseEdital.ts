// ============================================================
// scripts/smokeAnaliseEdital.ts — Testa a análise de edital ponta a ponta
// contra uma licitação real do PNCP, SEM precisar de banco nem de Redis.
//
// Baixa os documentos, mostra a decisão do modo híbrido documento por
// documento (texto barato x PDF nativo) e roda a análise do MESMO jeito que o
// worker: com as duas chaves (GEMINI_API_KEY e ANTHROPIC_API_KEY), o Gemini
// analisa e a Claude revisa; mostra o que o revisor corrigiu, a conferência
// de literalidade da matriz de exigências e o consumo de cada etapa.
//
// Uso:
//   npx ts-node scripts/smokeAnaliseEdital.ts <cnpj> <ano> <sequencial> [--dry]
//
// Esta é a ÚNICA coisa no projeto que gasta crédito de API de propósito, e
// só quando executada à mão (a revisão usa o modelo mais caro: veja o custo no
// final). --dry baixa e mostra os documentos, mas NÃO chama modelo nenhum.
// Controle o modo com AI_PIPELINE=dupla|gemini|claude (ver analiseEmDupla.ts).
// ============================================================

import 'dotenv/config'
import { downloadPNCPDocument, isPdf, listPNCPDocuments, selecionarDocumentos } from '../src/services/pncpDocumentsService'
import { extractPdf, temCamadaDeTexto } from '../src/services/pdfTextService'
import { EditalDocumento } from '../src/services/llm/types'
import { analyzeEdital as analyzeWithClaude } from '../src/services/llm/claudeAnalyzer'
import { analyzeEdital as analyzeWithGemini } from '../src/services/llm/geminiAnalyzer'
import { reviewEdital } from '../src/services/llm/claudeReviewer'
import { configuracaoDeIa, executarPipeline } from '../src/services/analiseEmDupla'
import { estimarCustoUsd } from '../src/services/aiUsageService'
import { resumoDaVerificacao } from '../src/lib/matrizExigencias'

const MAX_DOCUMENTOS = 5

function kb(bytes: number): string {
  return `${Math.round(bytes / 1024)} KB`
}

async function main() {
  const [cnpj, ano, sequencial] = process.argv.slice(2)
  if (!cnpj || !ano || !sequencial) {
    console.error('Uso: npx ts-node scripts/smokeAnaliseEdital.ts <cnpj> <ano> <sequencial>')
    process.exit(1)
  }

  // --dry: baixa os documentos e mostra a decisão do híbrido, mas para antes
  // de chamar o modelo. Não gasta crédito nenhum — a API do PNCP é pública.
  const dry = process.argv.includes('--dry')

  const config = configuracaoDeIa()
  config.avisos.forEach((a) => console.warn(`AVISO: ${a}`))
  if (!dry && !config.analista) {
    console.error('Nenhuma chave de IA no .env. Preencha GEMINI_API_KEY e/ou ANTHROPIC_API_KEY antes de rodar.')
    process.exit(1)
  }

  console.log(`\nLicitação: CNPJ ${cnpj} · ano ${ano} · sequencial ${sequencial}`)
  console.log(
    config.modo === 'dupla'
      ? 'Modo: DUPLA (Gemini analisa, Claude revisa)\n'
      : `Modo: ${config.modo ?? 'sem IA configurada'} (sem revisão)\n`
  )

  const disponiveis = selecionarDocumentos(await listPNCPDocuments(cnpj, ano, sequencial))
  console.log(`${disponiveis.length} documento(s) publicado(s) no PNCP:`)
  disponiveis.forEach((d, i) => console.log(`  ${i + 1}. ${d.titulo} [${d.tipoDocumentoNome}]`))
  console.log()

  const documentos: EditalDocumento[] = []

  for (const doc of disponiveis) {
    if (documentos.length >= MAX_DOCUMENTOS) break

    const buffer = await downloadPNCPDocument(doc.uri)
    if (!isPdf(buffer)) {
      console.log(`  ~ "${doc.titulo}" não é PDF — ignorado`)
      continue
    }

    const extraido = await extractPdf(buffer).catch(() => null)
    const paginas = extraido?.paginas ?? 0
    const caracteres = extraido?.texto.replace(/\s/g, '').length ?? 0
    const porPagina = paginas > 0 ? Math.round(caracteres / paginas) : 0

    if (extraido && temCamadaDeTexto(extraido.texto, extraido.paginas)) {
      console.log(`  TEXTO  "${doc.titulo}" — ${paginas} pág, ${porPagina} car/pág (${kb(buffer.byteLength)})`)
      documentos.push({ nome: doc.titulo, tipo: 'texto', texto: extraido.textoComPaginas })
    } else {
      console.log(
        `  PDF    "${doc.titulo}" — ${paginas} pág, ${porPagina} car/pág → sem camada de texto, vai escaneado (${kb(buffer.byteLength)})`
      )
      documentos.push({ nome: doc.titulo, tipo: 'pdf', data: buffer })
    }
  }

  if (documentos.length === 0) {
    console.error('\nNenhum PDF utilizável encontrado — nada a analisar.')
    process.exit(1)
  }

  const comoTexto = documentos.filter((d) => d.tipo === 'texto').length
  console.log(`\n${documentos.length} documento(s): ${comoTexto} como texto, ${documentos.length - comoTexto} como PDF nativo.`)

  if (dry) {
    console.log('\n--dry: parando aqui. O modelo NÃO foi chamado e nenhum crédito foi gasto.\n')
    return
  }

  console.log('Chamando o modelo (isto gasta crédito)...\n')

  const inicio = Date.now()
  const analista = config.analista === 'gemini' ? analyzeWithGemini : analyzeWithClaude
  const revisor = config.revisor === 'claude' ? reviewEdital : null
  const r = await executarPipeline({ objeto: 'Licitação de teste do smoke script', documentos, analista, revisor })
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1)
  const resultado = r.resultado

  console.log(`--- RESULTADO FINAL (${segundos}s) ---\n`)
  console.log(`Resumo: ${resultado.resumo}`)
  console.log(`Valor estimado: ${resultado.valorEstimado}`)
  console.log(`Data da sessão: ${resultado.dataSessao}`)
  console.log(`Critério de julgamento: ${resultado.criterioJulgamento}`)
  console.log(`Prazo de impugnação: ${resultado.prazoImpugnacao}`)
  console.log(`Garantia de proposta: ${resultado.garantiaProposta}`)
  console.log(`Garantia contratual: ${resultado.garantiaContratual}`)
  console.log(`Patrimônio líquido mínimo: ${resultado.patrimonioLiquidoMinimo}`)
  console.log(`Visita técnica: ${resultado.visitaTecnica}`)
  console.log(`\nExigências técnicas (${resultado.exigenciasTecnicas.length}):`)
  resultado.exigenciasTecnicas.forEach((e) => console.log(`  - ${e}`))
  console.log(`\nDocumentos exigidos (${resultado.documentosExigidos.length}):`)
  resultado.documentosExigidos.forEach((d) => console.log(`  - ${d}`))
  console.log(`\nRiscos (${resultado.riscos.length}):`)
  resultado.riscos.forEach((x) => console.log(`  [${x.severidade.toUpperCase()}] ${x.titulo}\n      ${x.descricao}`))

  console.log(`\n--- MATRIZ DE EXIGÊNCIAS (${resultado.matrizExigencias.length}) ---`)
  const v = resumoDaVerificacao(resultado.matrizExigencias)
  console.log(
    `Conferência por código: ${v.confirmado} confirmadas · ${v.parcial} parciais · ${v['nao-localizado']} NÃO localizadas · ${v['nao-verificavel']} não verificáveis`
  )
  resultado.matrizExigencias.slice(0, 15).forEach((e, i) => {
    const pag = e.verificacao.paginaConfirmada ?? e.pagina
    console.log(`  ${i + 1}. [${e.verificacao.status}] pág ${pag} item ${e.item || '-'} (${e.responsavel}) ${e.texto.slice(0, 110)}`)
  })
  if (resultado.matrizExigencias.length > 15) console.log(`  ... e mais ${resultado.matrizExigencias.length - 15}`)

  console.log('\n--- REVISÃO ---')
  const rev = r.revisao
  if (rev.status === 'OK') {
    console.log(`Veredito: ${rev.veredito} · ${rev.totalDeAlteracoes} alteração(ões) · revisor ${rev.revisor?.provider}/${rev.revisor?.model}`)
    if (rev.resumo) console.log(`Resumo do revisor: ${rev.resumo}`)
    rev.alteracoes.slice(0, 20).forEach((a) => {
      console.log(`  [${a.tipo}] ${a.campo}${a.motivo ? ` — ${a.motivo}` : ''}`)
      if (a.antes) console.log(`      antes : ${a.antes.slice(0, 140)}`)
      if (a.depois) console.log(`      depois: ${a.depois.slice(0, 140)}`)
    })
  } else {
    console.log(`Status: ${rev.status} — ${rev.motivo ?? ''}`)
    if (rev.detalheTecnico) console.log(`Detalhe técnico: ${rev.detalheTecnico}`)
  }

  console.log('\n--- CONSUMO ---')
  let totalUsd = 0
  let sabeCusto = true
  for (const u of r.usos) {
    const custo = estimarCustoUsd(u.uso.inputTokens, u.uso.outputTokens, process.env, u.uso.provider)
    if (custo === null) sabeCusto = false
    else totalUsd += custo
    console.log(
      `  ${u.etapa.padEnd(8)} ${u.uso.provider}/${u.uso.model}: ${u.uso.inputTokens} in, ${u.uso.outputTokens} out, ${(u.durationMs / 1000).toFixed(1)}s [${u.status}]` +
        (custo === null ? '' : ` ~US$ ${custo.toFixed(4)}`)
    )
  }
  console.log(
    sabeCusto
      ? `  Custo estimado da análise: ~US$ ${totalUsd.toFixed(4)}`
      : '  (defina AI_PRICE_GEMINI_* e AI_PRICE_CLAUDE_*_PER_MTOK no .env para ver o custo em dólar)'
  )
  console.log()
}

main().catch((err) => {
  console.error('\nFalhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
