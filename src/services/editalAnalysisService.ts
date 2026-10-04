// ============================================================
// services/editalAnalysisService.ts — Baixa o conjunto documental de uma
// licitação e faz uma análise minuciosa por IA, cruzando com o
// checklist de habilitação (Lei 14.133/2021).
//
// Provedor de IA controlado por AI_PROVIDER no .env ('claude' | 'gemini',
// default 'claude'). Pensado pra trocar sem mexer em código: use 'gemini'
// (gratuito, via Google AI Studio) enquanto não tiver crédito na Claude,
// e volte pra 'claude' depois — ver src/services/llm/.
//
// AI_ANALYSIS_ENABLED é o interruptor geral: desligado (padrão), a função
// marca a análise como DISABLED antes de qualquer I/O — não baixa documento,
// não chama modelo, não gasta crédito.
// ============================================================

import axios from 'axios'
import { Prisma, Tender } from '@prisma/client'
import { prisma } from './tenderService'
import { downloadPNCPDocument, isPdf, listPNCPDocuments, selecionarDocumentos } from './pncpDocumentsService'
import { listNovacapDocumentos } from './novacapParser'
import { ordenarPorPrioridade, DocumentoComTitulo } from '../lib/documentPriority'
import { extractPdf, temCamadaDeTexto } from './pdfTextService'
import { AnalysisRefusedError, EditalAnalyzer, EditalDocumento, ErroComUso } from './llm/types'
import type { EditalReviewer } from './llm/revisao'
import { QuemPediu, registrarUsoDeIa } from './aiUsageService'
import { analyzeEdital as analyzeWithClaude } from './llm/claudeAnalyzer'
import { analyzeEdital as analyzeWithGemini } from './llm/geminiAnalyzer'
import { reviewEdital } from './llm/claudeReviewer'
import { ConfiguracaoDeIa, configuracaoDeIa, executarPipeline } from './analiseEmDupla'
import { pareceErroDeChave, textoDoDiagnostico } from '../lib/diagnosticoDeChave'

interface DocumentoDisponivel extends DocumentoComTitulo {
  uri: string
}

// Teto por requisição da API (32 MB). Ficamos abaixo com folga porque o
// base64 infla o binário em cerca de 1/3. Só conta o que vai em PDF nativo.
const MAX_BYTES_PDF_TOTAL = 20 * 1024 * 1024
// Orçamento de texto do conjunto. Nenhum documento é truncado: quando o
// orçamento acaba, paramos de incluir novos — o edital, que é o primeiro da
// fila de prioridade, nunca é o cortado.
const MAX_CARACTERES_TOTAL = 800_000
const MAX_DOCUMENTOS = 5

export function analiseHabilitada(): boolean {
  return process.env.AI_ANALYSIS_ENABLED === 'true'
}

// Quem analisa e quem revisa, conforme as chaves e o AI_PIPELINE (ver
// analiseEmDupla.ts): com as duas chaves, o Gemini analisa e a Claude revisa.
function escolherModelos(config: ConfiguracaoDeIa): { analista: EditalAnalyzer; revisor: EditalReviewer | null } | null {
  if (!config.analista) return null
  const analista = config.analista === 'gemini' ? analyzeWithGemini : analyzeWithClaude
  return { analista, revisor: config.revisor === 'claude' ? reviewEdital : null }
}

// Pontos de injeção para teste: permitem rodar o fluxo completo (banco real)
// sem rede e sem gastar crédito de IA.
export interface DependenciasDaAnalise {
  obterDocumentos?: (tender: Tender) => Promise<EditalDocumento[]>
  analista?: EditalAnalyzer
  // null = análise sem revisão; ausente = decidir pela configuração.
  revisor?: EditalReviewer | null
}

// Lista os documentos de uma licitação, já do mais relevante para o menos —
// cada fonte tem seu próprio jeito de chegar neles. Fontes sem acesso
// público a anexo (FIEG exige login no site de origem — mesma regra que
// vale pros outros portais com login, ver Etapa 5; ComprasNet nunca teve
// esse link capturado, módulo Lei 8.666 praticamente inativo) devolvem
// lista vazia e caem no NO_DOCUMENTS de sempre, sem tratamento especial.
async function listarDocumentosDisponiveis(tender: Tender): Promise<DocumentoDisponivel[]> {
  switch (tender.fonte) {
    case 'PNCP': {
      const raw = tender.rawJson as Record<string, unknown>
      const orgaoEntidade = raw.orgaoEntidade as Record<string, unknown> | undefined
      const cnpj = orgaoEntidade?.cnpj as string | undefined
      const ano = raw.anoCompra as number | undefined
      const sequencial = raw.sequencialCompra as number | undefined
      if (!cnpj || !ano || !sequencial) return []
      return selecionarDocumentos(await listPNCPDocuments(cnpj, ano, sequencial))
    }
    case 'NOVACAP': {
      // fonteId é sempre "NOVACAP-{id}" (ver novacapParser.ts) — sob demanda
      // aqui, na hora da análise, mesmo padrão do PNCP: não fica no banco.
      const detailId = tender.fonteId.replace('NOVACAP-', '')
      return ordenarPorPrioridade(await listNovacapDocumentos(detailId))
    }
    case 'SESC_GO': {
      // Sem página de detalhe por licitação nesta fonte — os anexos já
      // vieram capturados na coleta (ver sescGoParser.ts).
      const raw = tender.rawJson as { anexos?: DocumentoDisponivel[] }
      return ordenarPorPrioridade(raw.anexos ?? [])
    }
    default:
      return []
  }
}

// Baixa até MAX_DOCUMENTOS PDFs, do mais relevante para o menos, e decide um
// a um se vai como texto (barato) ou em PDF nativo (quando é escaneado e não
// há texto para extrair).
async function baixarDocumentos(disponiveis: DocumentoDisponivel[]): Promise<EditalDocumento[]> {
  const selecionados: EditalDocumento[] = []
  let bytesDePdf = 0
  let caracteres = 0

  for (const doc of disponiveis) {
    if (selecionados.length >= MAX_DOCUMENTOS) break

    try {
      const buffer = await downloadPNCPDocument(doc.uri)
      if (!isPdf(buffer)) continue

      let extraido: { texto: string; paginas: number; textoComPaginas: string } | null = null
      try {
        extraido = await extractPdf(buffer)
      } catch (err) {
        console.warn(
          `[Análise de edital] Não deu para ler o texto de "${doc.titulo}", tentando como PDF:`,
          err instanceof Error ? err.message : err
        )
      }

      if (extraido && temCamadaDeTexto(extraido.texto, extraido.paginas)) {
        // Vai o texto com marcadores [[PÁGINA n]], para a IA citar a página de cada exigência.
        const textoParaIa = extraido.textoComPaginas
        if (caracteres + textoParaIa.length > MAX_CARACTERES_TOTAL) continue
        selecionados.push({ nome: doc.titulo, tipo: 'texto', texto: textoParaIa })
        caracteres += textoParaIa.length
        continue
      }

      // Sem camada de texto: é escaneado. Vai o arquivo, para o modelo ler a página.
      if (bytesDePdf + buffer.byteLength > MAX_BYTES_PDF_TOTAL) continue
      console.log(`[Análise de edital] "${doc.titulo}" parece escaneado — enviando como PDF nativo.`)
      selecionados.push({ nome: doc.titulo, tipo: 'pdf', data: buffer })
      bytesDePdf += buffer.byteLength
    } catch (err) {
      console.error(`[Análise de edital] Falha ao baixar "${doc.titulo}":`, err instanceof Error ? err.message : err)
    }
  }

  return selecionados
}

export async function runEditalAnalysis(
  tenderId: string,
  quem?: QuemPediu,
  deps: DependenciasDaAnalise = {}
): Promise<void> {
  if (!analiseHabilitada()) {
    await prisma.tenderAnalysis.upsert({
      where: { tenderId },
      update: {
        status: 'DISABLED',
        errorMsg: 'A análise de edital por IA está desligada nesta instalação (AI_ANALYSIS_ENABLED).',
      },
      create: {
        tenderId,
        status: 'DISABLED',
        errorMsg: 'A análise de edital por IA está desligada nesta instalação (AI_ANALYSIS_ENABLED).',
      },
    })
    return
  }

  await prisma.tenderAnalysis.upsert({
    where: { tenderId },
    update: { status: 'RUNNING', errorMsg: null },
    create: { tenderId, status: 'RUNNING' },
  })

  try {
    const tender = await prisma.tender.findUnique({ where: { id: tenderId } })
    if (!tender) throw new Error('Licitação não encontrada')

    let documentos: EditalDocumento[]
    if (deps.obterDocumentos) {
      documentos = await deps.obterDocumentos(tender)
    } else {
      const disponiveis = await listarDocumentosDisponiveis(tender)

      if (disponiveis.length === 0) {
        await prisma.tenderAnalysis.update({
          where: { tenderId },
          data: {
            status: 'NO_DOCUMENTS',
            errorMsg: 'Nenhum documento disponível publicamente para esta licitação nesta fonte.',
          },
        })
        return
      }

      documentos = await baixarDocumentos(disponiveis)
    }

    if (documentos.length === 0) {
      await prisma.tenderAnalysis.update({
        where: { tenderId },
        data: { status: 'NO_DOCUMENTS', errorMsg: 'Nenhum documento em PDF foi encontrado para esta licitação.' },
      })
      return
    }

    const documentoNome = documentos.map((d) => d.nome).join(' · ')

    // Quem analisa e quem revisa (injeção para teste; senão, pela configuração).
    let analista = deps.analista
    let revisor = deps.revisor
    if (!analista) {
      const config = configuracaoDeIa()
      for (const aviso of config.avisos) console.warn(`[Análise de edital] ${aviso}`)
      const modelos = escolherModelos(config)
      if (!modelos) {
        await prisma.tenderAnalysis.update({
          where: { tenderId },
          data: {
            status: 'FAILED',
            documentoNome,
            errorMsg: 'A análise por IA não está configurada nesta instalação (chave de IA ausente).',
          },
        })
        return
      }
      analista = modelos.analista
      if (revisor === undefined) revisor = modelos.revisor
    }

    let pipeline
    const inicioIa = Date.now()
    // Quando há revisão, a análise do analista já é gravada (e o consumo dele medido) ANTES de a
    // revisão começar: o usuário lê a prévia enquanto a Claude, mais lenta, confere o edital.
    let analistaJaRegistrado = false
    try {
      pipeline = await executarPipeline({
        objeto: tender.objeto,
        documentos,
        analista,
        revisor: revisor ?? null,
        aoConcluirAnalista: async (previa) => {
          await registrarUsoDeIa({
            tenderId,
            quem,
            uso: previa.usoDoAnalista.uso,
            durationMs: previa.usoDoAnalista.durationMs,
            status: previa.usoDoAnalista.status,
            etapa: 'analise',
          })
          analistaJaRegistrado = true
          await prisma.tenderAnalysis.update({
            where: { tenderId },
            data: {
              status: 'DONE',
              documentoNome,
              resultado: previa.resultado as unknown as object,
              rascunho: Prisma.DbNull,
              revisao: previa.revisao as unknown as object,
              pipeline: 'dupla',
              errorMsg: null,
            },
          })
        },
      })
    } catch (rawErr) {
      // Falha do ANALISTA depois da chamada ao modelo: os tokens já foram gastos e entram na medição.
      let err = rawErr
      if (rawErr instanceof ErroComUso) {
        await registrarUsoDeIa({ tenderId, quem, uso: rawErr.uso, durationMs: Date.now() - inicioIa, status: 'ERRO', etapa: 'analise' })
        err = rawErr.causa
      }
      if (err instanceof AnalysisRefusedError) {
        await prisma.tenderAnalysis.update({
          where: { tenderId },
          data: { status: 'FAILED', documentoNome, errorMsg: err.message },
        })
        return
      }
      throw err
    }

    // Cada etapa (analista e revisor) vira uma linha de consumo (o analista pode já ter sido registrado na prévia).
    for (const u of pipeline.usos.slice(analistaJaRegistrado ? 1 : 0)) {
      await registrarUsoDeIa({ tenderId, quem, uso: u.uso, durationMs: u.durationMs, status: u.status, etapa: u.etapa })
    }

    await prisma.tenderAnalysis.update({
      where: { tenderId },
      data: {
        status: 'DONE',
        documentoNome,
        resultado: pipeline.resultado as unknown as object,
        rascunho: pipeline.rascunho ? (pipeline.rascunho as unknown as object) : Prisma.DbNull,
        revisao: pipeline.revisao as unknown as object,
        pipeline: pipeline.pipeline,
        errorMsg: null,
      },
    })
  } catch (err) {
    // As fontes de origem (API do PNCP, sites da Novacap etc.) caem com
    // frequência, fora do nosso controle — em vez do axios "Request failed
    // with status code 503" cru, mostra algo que a pessoa usuária entenda.
    const isFonteFora = axios.isAxiosError(err) && (!err.response || err.response.status >= 500)
    // O detalhe do erro (mensagem do axios, host/porta interna, stack do SDK)
    // fica só no log do servidor — nunca em errorMsg, que qualquer usuário lê
    // em GET /:id/analysis. Ao usuário vai só uma mensagem genérica.
    const msgDoErro = err instanceof Error ? err.message : String(err)
    console.error(`[Análise de edital] Falha ao analisar ${tenderId}:`, msgDoErro)
    // Falha do analista por chave recusada: o log mostra o FORMATO das chaves (nunca as chaves).
    if (pareceErroDeChave(msgDoErro)) console.error(`[Análise de edital] Diagnóstico das chaves: ${textoDoDiagnostico()}`)
    const errorMsg = isFonteFora
      ? 'A fonte de origem está indisponível no momento (não foi possível baixar os documentos do edital). Tente novamente mais tarde.'
      : 'Não foi possível concluir a análise deste edital. Tente novamente mais tarde.'
    await prisma.tenderAnalysis.update({
      where: { tenderId },
      data: { status: 'FAILED', errorMsg },
    })
    throw err
  }
}
