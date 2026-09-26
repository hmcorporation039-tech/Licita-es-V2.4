// ============================================================
// services/pncpParser.ts — Normaliza resposta do PNCP
// Docs: https://pncp.gov.br/api/consulta/swagger-ui/index.html
// ============================================================

import {
  NormalizedTender,
  NormalizedTenderItem,
  PNCP_MODALIDADE_MAP,
} from '../types'
import { getMunicipioByIbge, findMunicipioByNomeUf } from '../lib/geoService'

// Trunca string longa para resumo
function truncate(str: string, max = 500): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// O payload do PNCP tem alguns KB por licitação e a base guarda centenas de
// milhares delas, mas só três campos são lidos depois — e sempre os mesmos
// três: são a chave composta (CNPJ + ano + sequencial) que as APIs de
// documentos, de itens e de situação exigem na URL. Ver as três chamadas em
// api/routes/tenders.ts, editalAnalysisService.ts e situacaoUpdateService.ts.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function rawJsonEssencial(raw: Record<string, any>): Record<string, unknown> {
  return {
    anoCompra: raw.anoCompra,
    sequencialCompra: raw.sequencialCompra,
    orgaoEntidade: { cnpj: raw.orgaoEntidade?.cnpj },
  }
}

// Normaliza uma contratação retornada pelo PNCP
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function parsePNCPTender(raw: Record<string, any>): NormalizedTender {
  const modalidadeCodigo = raw.modalidadeId ?? raw.codigoModalidadeContratacao
  const modalidade = PNCP_MODALIDADE_MAP[modalidadeCodigo] ?? 'OUTROS'

  // fonteId: usa numeroControlePNCP como chave única
  const fonteId =
    raw.numeroControlePNCP ??
    `${raw.orgaoEntidade?.cnpj}-${raw.anoCompra}-${raw.sequencialCompra}`

  const objeto = raw.objetoCompra ?? raw.objeto ?? ''

  const uf = raw.unidadeOrgao?.ufSigla ?? raw.uf
  const municipio = raw.unidadeOrgao?.municipioNome
  const municipioIbge = raw.unidadeOrgao?.codigoIbge ? String(raw.unidadeOrgao.codigoIbge) : undefined

  // O código IBGE é a referência mais confiável; cai para nome+UF se ausente
  const geo =
    (municipioIbge ? getMunicipioByIbge(municipioIbge) : undefined) ??
    (municipio && uf ? findMunicipioByNomeUf(municipio, uf) : undefined)

  return {
    fonte: 'PNCP',
    fonteId,
    modalidade,
    objeto,
    objetoResumido: truncate(objeto),
    valorEstimado: raw.valorTotalEstimado
      ? parseFloat(raw.valorTotalEstimado)
      : undefined,
    uf,
    municipio,
    municipioIbge,
    municipioLat: geo?.lat,
    municipioLng: geo?.lng,
    orgao: raw.orgaoEntidade?.razaoSocial ?? raw.nomeOrgao,
    orgaoCnpj: raw.orgaoEntidade?.cnpj,
    unidade: raw.unidadeOrgao?.nomeUnidade,
    aberturaAt: raw.dataAberturaProposta
      ? new Date(raw.dataAberturaProposta)
      : undefined,
    encerramentoAt: raw.dataEncerramentoProposta
      ? new Date(raw.dataEncerramentoProposta)
      : undefined,
    publicadoAt: raw.dataPublicacaoPncp
      ? new Date(raw.dataPublicacaoPncp)
      : undefined,
    linkEdital: raw.linkSistemaOrigem ?? raw.linkEdital,
    numeroControle: raw.numeroControlePNCP,
    rawJson: rawJsonEssencial(raw),
    items: raw.itens ? parsePNCPItems(raw.itens) : undefined,
  }
}

// Normaliza lista de itens do PNCP
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function parsePNCPItems(itens: Record<string, any>[]): NormalizedTenderItem[] {
  return itens.map((item) => ({
    numeroItem: item.numeroItem,
    descricao: item.descricao ?? item.descricaoItem ?? '',
    catmatCode: item.codigoCatalogoProduto ?? item.numeroCatalogoProduto,
    unidadeMedida: item.unidadeMedida,
    quantidade: item.quantidade ? parseFloat(item.quantidade) : undefined,
    valorUnitario: item.valorUnitarioEstimado
      ? parseFloat(item.valorUnitarioEstimado)
      : undefined,
    valorTotal: item.valorTotalItem
      ? parseFloat(item.valorTotalItem)
      : undefined,
  }))
}
