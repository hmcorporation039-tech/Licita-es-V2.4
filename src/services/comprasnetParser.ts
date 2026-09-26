// ============================================================
// services/comprasnetParser.ts — Normaliza resposta do ComprasNet
// Fonte: /modulo-legado/1_consultarLicitacao (Lei 8.666/10.520)
// Docs: https://dadosabertos.compras.gov.br/swagger-ui/index.html
//
// rawJson vai vazio de propósito: os três lugares que leem esse campo
// (api/routes/tenders.ts, editalAnalysisService.ts, situacaoUpdateService.ts)
// atendem só licitação do PNCP e saem antes de tocar no payload quando a
// fonte é ComprasNet. Guardar o registro bruto aqui era peso morto no banco.
// ============================================================

import {
  NormalizedTender,
  COMPRASNET_MODALIDADE_MAP,
} from '../types'

function truncate(str: string, max = 500): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// Normaliza um registro do módulo legado do ComprasNet/dadosabertos
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseComprasnetTender(raw: Record<string, any>): NormalizedTender {
  const modalidadeCodigo = String(raw.modalidade ?? '')
  let modalidade = COMPRASNET_MODALIDADE_MAP[modalidadeCodigo] ?? 'OUTROS'
  // Código 5 (PREGÃO) cobre eletrônico e presencial — desambigua pelo tipo_pregao
  if (modalidadeCodigo === '5') {
    modalidade = raw.tipo_pregao === 'presencial' ? 'PREGAO_PRESENCIAL' : 'PREGAO_ELETRONICO'
  }

  // id_compra é o identificador único do registro nesse módulo
  const fonteId = `CNET-LEGADO-${raw.id_compra ?? raw.identificador ?? raw.numero_processo}`

  const objeto = raw.objeto ?? ''

  return {
    fonte: 'COMPRASNET',
    fonteId,
    modalidade,
    objeto,
    objetoResumido: truncate(objeto),
    valorEstimado:
      raw.valor_estimado_total !== undefined && raw.valor_estimado_total !== null
        ? Number(raw.valor_estimado_total)
        : undefined,
    // uf/orgao não vêm nesse endpoint — só o código da UASG (unidade compradora).
    // Cruzar com /modulo-uasg para obter nome/UF fica para uma próxima fase.
    unidade: raw.uasg !== undefined && raw.uasg !== null ? String(raw.uasg) : undefined,
    aberturaAt: raw.data_abertura_proposta ? new Date(raw.data_abertura_proposta) : undefined,
    encerramentoAt: raw.data_entrega_proposta ? new Date(raw.data_entrega_proposta) : undefined,
    publicadoAt: raw.data_publicacao ? new Date(raw.data_publicacao) : undefined,
    numeroControle: raw.numero_processo,
    rawJson: {},
    // Itens exigem uma chamada separada a /modulo-legado/2_consultarItemLicitacao
    // por licitação — fica para uma próxima fase (matching por CATMAT depende disso).
    items: undefined,
  }
}

// Normaliza um registro de compra sem licitação (dispensa/inexigibilidade)
// Fonte: /modulo-legado/5_consultarComprasSemLicitacao
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parseComprasnetDispensa(raw: Record<string, any>): NormalizedTender {
  const modalidadeCodigo = String(raw.co_modalidade_licitacao ?? '')
  const modalidade = COMPRASNET_MODALIDADE_MAP[modalidadeCodigo] ?? 'OUTROS'

  const fonteId = `CNET-DISPENSA-${raw.id_compra}`

  const objeto = raw.ds_objeto_licitacao ?? ''

  // Nenhuma das três datas é sempre preenchida na fonte — usa a primeira disponível
  const publicadoAt = raw.dt_publicacao ?? raw.dt_ratificacao ?? raw.dt_declaracao_dispensa

  return {
    fonte: 'COMPRASNET',
    fonteId,
    modalidade,
    objeto,
    objetoResumido: truncate(objeto),
    valorEstimado: raw.vr_estimado !== undefined && raw.vr_estimado !== null ? Number(raw.vr_estimado) : undefined,
    orgao: raw.no_ausg ?? undefined,
    unidade: raw.co_uasg !== undefined && raw.co_uasg !== null ? String(raw.co_uasg) : undefined,
    publicadoAt: publicadoAt ? new Date(publicadoAt) : undefined,
    numeroControle: raw.nu_processo,
    rawJson: {},
    items: undefined,
  }
}
