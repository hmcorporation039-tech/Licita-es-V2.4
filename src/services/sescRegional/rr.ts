// ============================================================
// services/sescRegional/rr.ts — Sesc Roraima
// Portal: https://licitacao.sescrr.com.br/ — uma aplicação React (Symfony +
// Webpack Encore) que monta a lista por uma API JSON pública do próprio site:
//   GET /licitacao?etapa=1&offset=0&limit=50
//   -> { "count": 8, "data": [ { id, modalidade:{titulo}, numProcesso, ano,
//        dataAbertura:"YYYY-MM-DD", dataPublicacao, datasRepublicacoes, objeto,
//        etapa:{id,titulo} } ] }
// A LISTA é pública; os arquivos (edital e anexos) exigem login de fornecedor
// ("Acessar Arquivos"), então linkEdital aponta para o portal.
//
// Etapas (GET /json/etapa): 1 PUBLICADA, 2 REPUBLICADA, 3 DESERTA, 4 FRACASSADA,
// 5 FRUSTRADA, 6 ADIADA, 7 CANCELADA, 8 FINALIZADA, 9 HOMOLOGAÇÃO. Só pedimos
// 1 e 2 (as que ainda podem receber proposta). O filtro de etapa vai no servidor,
// então a lista vem curta (8 itens hoje, de 457 no histórico).
//
// "Atual" = etapa publicada/republicada E data de abertura de hoje em diante. O
// portal deixa como PUBLICADA processos de anos atrás, por isso a data decide.
// Credenciamento fica aberto depois da "abertura": vale só a etapa.
// ============================================================

import { NormalizedTender } from '../../types'
import { SECTIGO_DV_R36_CA } from './certificados'
import { ContextoDeParse, SescUnidade, ehLicitacaoAtual, limparTexto, montarTender } from './tipos'

const BASE = 'https://licitacao.sescrr.com.br'
const POR_PAGINA = 50
const ETAPAS_ABERTAS = [1, 2] // PUBLICADA, REPUBLICADA

interface LicitacaoRR {
  id?: number
  modalidade?: { titulo?: string | null } | null
  numProcesso?: string | null
  dataAbertura?: string | null // 'YYYY-MM-DD'
  dataPublicacao?: string | null
  objeto?: string | null
  etapa?: { titulo?: string | null } | null
}

interface RespostaRR {
  count?: number
  data?: LicitacaoRR[]
}

function urlPagina(etapa: number, offset: number): string {
  return `${BASE}/licitacao?etapa=${etapa}&offset=${offset}&limit=${POR_PAGINA}`
}

function lerResposta(texto: string): RespostaRR {
  try {
    return JSON.parse(texto) as RespostaRR
  } catch {
    // Um corpo que não é JSON (página de erro/bloqueio) deve aparecer como falha
    // da unidade no log do coletor, e não como "zero licitações".
    throw new Error('Sesc RR: resposta da API não é JSON válido')
  }
}

// 'YYYY-MM-DD' -> Date local (meia-noite). undefined se inválido.
function dataIso(valor?: string | null): Date | undefined {
  const m = valor?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return undefined
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]))
  return Number.isNaN(d.getTime()) ? undefined : d
}

function parse(texto: string, ctx: ContextoDeParse): NormalizedTender[] {
  const resultado: NormalizedTender[] = []
  for (const l of lerResposta(texto).data ?? []) {
    const objeto = limparTexto(l.objeto)
    if (!l.id || !objeto) continue

    const modalidadeTexto = limparTexto(l.modalidade?.titulo)
    const abertura = dataIso(l.dataAbertura)
    const credenciamento = /credenciamento/i.test(modalidadeTexto)
    const atual = ehLicitacaoAtual(
      { situacao: limparTexto(l.etapa?.titulo), aberturaAt: credenciamento ? undefined : abertura },
      ctx.agora
    )
    if (!atual) continue

    resultado.push(
      montarTender(sescRR, {
        idLocal: String(l.id),
        objeto,
        modalidadeTexto,
        numeroControle: limparTexto(l.numProcesso) || undefined,
        aberturaAt: abertura,
        encerramentoAt: abertura,
        publicadoAt: dataIso(l.dataPublicacao),
        linkEdital: BASE + '/',
      })
    )
  }
  return resultado
}

// A lista filtrada por etapa cabe numa página (8 itens hoje), mas se passar de 50
// pedimos a seguinte mantendo a mesma etapa.
function proximasPaginas(texto: string, ctx: ContextoDeParse): string[] {
  const resposta = lerResposta(texto)
  const offset = Number(ctx.url.match(/[?&]offset=(\d+)/)?.[1] ?? 0)
  const etapa = Number(ctx.url.match(/[?&]etapa=(\d+)/)?.[1])
  if (!etapa || (resposta.count ?? 0) <= offset + POR_PAGINA) return []
  return [urlPagina(etapa, offset + POR_PAGINA)]
}

export const sescRR: SescUnidade = {
  uf: 'RR',
  nome: 'Sesc Roraima',
  urls: () => ETAPAS_ABERTAS.map((etapa) => urlPagina(etapa, 0)),
  // O servidor do RR envia só o certificado do site, sem o intermediário (Sectigo):
  // confiamos nele só para esta unidade, mantendo a verificação completa.
  certificadosConfiaveis: [SECTIGO_DV_R36_CA],
  parse,
  proximasPaginas,
}
