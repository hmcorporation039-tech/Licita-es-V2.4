// ============================================================
// services/sescRegional/paradigma.ts — Portais de compras do SESC na plataforma
// Paradigma (ASP.NET): DN, SP, RJ, BA e RS. Uma só implementação para as cinco.
//
// O HTML do Mural (/portal/Mural.aspx) não traz a lista: o navegador a pede por
// AJAX. Fazemos a mesma chamada que o próprio portal faz:
//   POST <base>/portal/WebService/Servicos.asmx/PesquisarProcessos
//   {"dtoProcesso": {..., "tmpTipoMuralVisao": 999, "dtoPaginacao": {...}}}
// Resposta: {"d": [ {nCdProcesso, sNrEdital, sDsObjeto, tDtInicial, tDtFinal,
// sDsSituacao, sNmModalidade, ...} ]}. Visão 999 = "processos em andamento".
// ATENÇÃO ao caminho: é RELATIVO à página do Mural (/portal/...), não à raiz da
// aplicação — na raiz o IIS responde 403.
//
// Particularidades desta API:
//  - As datas "formatadas" (sDtInicialFormatada...) e alguns números de edital
//    vêm mascarados com caracteres de controle; usamos as datas em epoch
//    (tDtInicial/tDtFinal, "/Date(ms)/" — o relógio local vem como se fosse UTC)
//    e o nº de exibição (sNrProcessoDisplay), limpando os caracteres de controle.
//  - Não há nome de modalidade único: "Processo de contratação / Pregão",
//    "Processos presenciais / Concorrência", "Cotação", "Dispensa"... (ver
//    modalidadeDe).
//  - Páginas de 50 itens, ordenadas por início decrescente; o "em andamento"
//    inclui processos antigos parados, por isso a data final decide o que é atual.
//
// "Atual" = data final (encerramento das propostas/sessão) de hoje em diante e
// situação sem indício de suspensão, homologação ou fase pós-disputa.
// ============================================================

import { NormalizedTender } from '../../types'
import {
  ContextoDeParse,
  SescUnidade,
  detectarModalidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  publicadaRecentemente,
} from './tipos'

const POR_PAGINA = 50
const VISAO_EM_ANDAMENTO = 999
// Só pedimos a próxima página se o último item desta ainda começou há pouco.
const DIAS_PARA_SEGUIR_PAGINACAO = 90

interface ProcessoParadigma {
  nCdProcesso?: number
  sNrEdital?: string | null
  sNrProcessoDisplay?: string | null
  sDsObjeto?: string | null
  sNmEmpresa?: string | null
  sNmModalidade?: string | null
  sNmModalidadeTipo?: string | null
  sDsSituacao?: string | null
  tDtInicial?: string | null // "/Date(1790773200000)/"
  tDtFinal?: string | null
  dVlEstimado?: number | null
}

interface RespostaParadigma {
  d?: ProcessoParadigma[]
}

// Fases em que o prazo de propostas já acabou (ou o processo está travado):
// não são oportunidade de participação.
const SITUACAO_FORA = /suspens|homologa|negocia|habilita|aceitabilidade/i

// "/Date(ms)/" -> Date local. O servidor manda o relógio local COMO SE fosse UTC
// (ex.: 12:00 local = ...T12:00:00Z), então recompomos pelos campos UTC.
export function dataParadigma(valor?: string | null): Date | undefined {
  const ms = Number(valor?.match(/-?\d+/)?.[0])
  if (!Number.isFinite(ms)) return undefined
  const u = new Date(ms)
  const d = new Date(u.getUTCFullYear(), u.getUTCMonth(), u.getUTCDate(), u.getUTCHours(), u.getUTCMinutes())
  return Number.isNaN(d.getTime()) ? undefined : d
}

// Remove os caracteres de controle com que a API mascara alguns campos.
function semControle(texto?: string | null): string {
  // eslint-disable-next-line no-control-regex
  return limparTexto((texto ?? '').replace(/[\u0000-\u001f\u007f]/g, ' '))
}

// "Processo de contratação / Pregão" (DN, RS) é o pregão eletrônico; "Processos
// presenciais / Pregão" é o presencial; "Cotação" e similares caem em OUTROS.
function modalidadeDe(p: ProcessoParadigma) {
  const tipo = semControle(p.sNmModalidadeTipo)
  const nome = semControle(p.sNmModalidade)
  return detectarModalidade(`${tipo && tipo !== '-' ? tipo : ''} ${nome}`)
}

function paginaDaUrl(url: string): number {
  const n = Number(url.match(/#pagina=(\d+)/)?.[1])
  return Number.isInteger(n) && n > 0 ? n : 1
}

function lerResposta(texto: string): ProcessoParadigma[] {
  try {
    return (JSON.parse(texto) as RespostaParadigma).d ?? []
  } catch {
    // Corpo que não é JSON (ex.: 403 do IIS ou página de erro) precisa aparecer
    // como falha da unidade no log do coletor, não como "zero licitações".
    throw new Error('Paradigma: resposta não é JSON válido')
  }
}

function corpoDaRequisicao(pagina: number): string {
  return JSON.stringify({
    dtoProcesso: {
      nAnoFinalizacao: 0,
      tmpTipoMuralProcesso: 0,
      nCdModulo: 0,
      nCdModalidade: 0,
      nCdModalidadeFase: 0,
      nCdTipoModalidade: 0,
      tmpTipoMuralVisao: VISAO_EM_ANDAMENTO,
      nCdSituacao: VISAO_EM_ANDAMENTO,
      nCdTipoProcesso: 0,
      nCdEmpresa: 0,
      sNrProcesso: '',
      nCdProcesso: 0,
      sDsObjeto: '',
      sDtPeriodoDe: '',
      sDtPeriodoAte: '',
      sOrdenarPor: 'TDTINICIAL',
      sOrdenarPorDirecao: 'DESC',
      dtoPaginacao: { nPaginaDe: (pagina - 1) * POR_PAGINA + 1, nPaginaAte: pagina * POR_PAGINA },
      dtoIdioma: { nCdIdioma: 1 },
    },
  })
}

export function criarUnidadeParadigma(cfg: {
  uf: string
  chave?: string
  nome: string
  // Raiz da aplicação, sem barra final (ex.: https://egov.paradigmabs.com.br/SESCRJ).
  base: string
}): SescUnidade {
  const endpoint = `${cfg.base}/portal/WebService/Servicos.asmx/PesquisarProcessos`
  const urlPagina = (n: number) => `${endpoint}#pagina=${n}`

  const unidade: SescUnidade = {
    uf: cfg.uf,
    chave: cfg.chave,
    nome: cfg.nome,
    urls: () => [urlPagina(1)],
    // Abre o Mural antes: cookie de sessão do ASP.NET e Referer, como o navegador.
    sessaoUrl: `${cfg.base}/portal/Mural.aspx`,
    requisicaoPost: (url) => ({
      corpo: corpoDaRequisicao(paginaDaUrl(url)),
      contentType: 'application/json; charset=utf-8',
    }),

    parse(texto: string, ctx: ContextoDeParse): NormalizedTender[] {
      const resultado: NormalizedTender[] = []
      for (const p of lerResposta(texto)) {
        const objeto = semControle(p.sDsObjeto)
        if (!p.nCdProcesso || !objeto) continue
        // Portal compartilhado com o Senac (ex.: RS): só entra o que é do Sesc.
        if (/senac/i.test(p.sNmEmpresa ?? '') && !/sesc/i.test(p.sNmEmpresa ?? '')) continue

        const situacao = semControle(p.sDsSituacao)
        if (SITUACAO_FORA.test(situacao)) continue

        const inicio = dataParadigma(p.tDtInicial)
        const fim = dataParadigma(p.tDtFinal)
        if (!ehLicitacaoAtual({ situacao, encerramentoAt: fim }, ctx.agora)) continue
        // Sem data final não dá para afirmar que está aberto: só vale se começou há pouco.
        if (!fim && !publicadaRecentemente(inicio, ctx.agora)) continue

        const tender = montarTender(unidade, {
          idLocal: String(p.nCdProcesso),
          objeto,
          modalidade: modalidadeDe(p),
          numeroControle: semControle(p.sNrProcessoDisplay) || semControle(p.sNrEdital) || undefined,
          valorEstimado: p.dVlEstimado && p.dVlEstimado > 0 ? p.dVlEstimado : undefined,
          aberturaAt: fim,
          encerramentoAt: fim,
          publicadoAt: inicio,
          // O detalhe só abre pelo JavaScript do Mural; apontamos para o Mural público.
          linkEdital: `${cfg.base}/portal/Mural.aspx`,
        })
        // Subunidade que compra (ex.: "SESC FLAMENGO", "SESC - FEIRA DE SANTANA").
        tender.unidade = semControle(p.sNmEmpresa) || undefined
        resultado.push(tender)
      }
      return resultado
    },

    // Ordenado por início decrescente: só vale pedir mais se a página veio cheia e
    // o último item ainda é recente (depois disso é histórico parado).
    proximasPaginas(texto: string, ctx: ContextoDeParse): string[] {
      const itens = lerResposta(texto)
      if (itens.length < POR_PAGINA) return []
      const inicioUltimo = dataParadigma(itens[itens.length - 1].tDtInicial)
      if (!inicioUltimo) return []
      const limite = ctx.agora.getTime() - DIAS_PARA_SEGUIR_PAGINACAO * 24 * 60 * 60 * 1000
      return inicioUltimo.getTime() >= limite ? [urlPagina(paginaDaUrl(ctx.url) + 1)] : []
    },
  }
  return unidade
}

export const sescDN = criarUnidadeParadigma({
  uf: 'RJ',
  chave: 'DN',
  nome: 'Sesc Departamento Nacional',
  base: 'https://egov-br.paradigmabs.com.br/sescdn',
})

export const sescSP = criarUnidadeParadigma({
  uf: 'SP',
  nome: 'Sesc São Paulo',
  base: 'https://scr360.paradigmabs.com.br/sescsp',
})

export const sescRJ = criarUnidadeParadigma({
  uf: 'RJ',
  nome: 'Sesc Rio de Janeiro',
  base: 'https://egov.paradigmabs.com.br/SESCRJ',
})

export const sescBA = criarUnidadeParadigma({
  uf: 'BA',
  nome: 'Sesc Bahia',
  base: 'https://egov.paradigmabs.com.br/sescba',
})

export const sescRS = criarUnidadeParadigma({
  uf: 'RS',
  nome: 'Sesc Rio Grande do Sul',
  base: 'https://egov.paradigmabs.com.br/sesc_senac_rs',
})
