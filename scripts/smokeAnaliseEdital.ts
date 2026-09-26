// ============================================================
// scripts/smokeAnaliseEdital.ts — Testa a análise de edital ponta a ponta
// contra uma licitação real do PNCP, SEM precisar de banco nem de Redis.
//
// Baixa os documentos, mostra a decisão do modo híbrido documento por
// documento (texto barato x PDF nativo) e chama o modelo uma única vez.
//
// Uso:
//   npx ts-node scripts/smokeAnaliseEdital.ts <cnpj> <ano> <sequencial>
//
// Esta é a ÚNICA coisa no projeto que gasta crédito de API de propósito, e
// só quando executada à mão. Aponte AI_PROVIDER="gemini" no .env para usar
// a cota gratuita do Google AI Studio.
// ============================================================

import 'dotenv/config'
import { downloadPNCPDocument, isPdf, listPNCPDocuments, selecionarDocumentos } from '../src/services/pncpDocumentsService'
import { extractPdf, temCamadaDeTexto } from '../src/services/pdfTextService'
import { EditalDocumento } from '../src/services/llm/types'
import { analyzeEdital as analyzeWithClaude } from '../src/services/llm/claudeAnalyzer'
import { analyzeEdital as analyzeWithGemini } from '../src/services/llm/geminiAnalyzer'

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

  const provider = (process.env.AI_PROVIDER || 'claude').toLowerCase()
  const chave = provider === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY
  if (!dry && !chave) {
    console.error(
      `AI_PROVIDER="${provider}" mas a chave correspondente está vazia no .env.\n` +
        'Preencha GEMINI_API_KEY (gratuita) ou ANTHROPIC_API_KEY antes de rodar.'
    )
    process.exit(1)
  }

  console.log(`\nLicitação: CNPJ ${cnpj} · ano ${ano} · sequencial ${sequencial}`)
  console.log(`Provedor: ${provider}\n`)

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
      documentos.push({ nome: doc.titulo, tipo: 'texto', texto: extraido.texto })
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
  const analisar = provider === 'gemini' ? analyzeWithGemini : analyzeWithClaude
  const resultado = await analisar('Licitação de teste do smoke script', documentos)
  const segundos = ((Date.now() - inicio) / 1000).toFixed(1)

  console.log(`--- RESULTADO (${segundos}s) ---\n`)
  console.log(`Resumo: ${resultado.resumo}`)
  console.log(`Valor estimado: ${resultado.valorEstimado}`)
  console.log(`Critério de julgamento: ${resultado.criterioJulgamento}`)
  console.log(`Prazo de impugnação: ${resultado.prazoImpugnacao}`)
  console.log(`Prazo de esclarecimento: ${resultado.prazoEsclarecimento}`)
  console.log(`\nExigências técnicas (${resultado.exigenciasTecnicas.length}):`)
  resultado.exigenciasTecnicas.forEach((e) => console.log(`  - ${e}`))
  console.log(`\nDocumentos exigidos (${resultado.documentosExigidos.length}):`)
  resultado.documentosExigidos.forEach((d) => console.log(`  - ${d}`))
  console.log(`\nRiscos (${resultado.riscos.length}):`)
  resultado.riscos.forEach((r) => console.log(`  [${r.severidade.toUpperCase()}] ${r.titulo}\n      ${r.descricao}`))
  console.log()
}

main().catch((err) => {
  console.error('\nFalhou:', err instanceof Error ? err.message : err)
  process.exit(1)
})
