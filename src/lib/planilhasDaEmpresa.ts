import type { FonteEnum, ModalidadeEnum, ParticipationStatusEnum, Prisma } from '@prisma/client'
import { aberturaEhInicioDasPropostas, dataDaSessao, type DatasDaLicitacao } from './dataDaSessao'
import { formatarPrazoDaLicitacao } from './dataDeBrasilia'
import type { ColunaDaPlanilha, ValorDaCelula } from './planilhaXlsx'

export const TETO_DE_LINHAS_DA_PLANILHA = 5000

export const ROTULOS_DE_MODALIDADE: Record<ModalidadeEnum, string> = {
  PREGAO_ELETRONICO: 'Pregão eletrônico',
  PREGAO_PRESENCIAL: 'Pregão presencial',
  CONCORRENCIA: 'Concorrência',
  DISPENSA_COM_DISPUTA: 'Dispensa com disputa',
  DISPENSA_SEM_DISPUTA: 'Dispensa sem disputa',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CONVITE: 'Convite',
  TOMADA_DE_PRECOS: 'Tomada de preços',
  CONCURSO: 'Concurso',
  CREDENCIAMENTO: 'Credenciamento',
  DIALOGO_COMPETITIVO: 'Diálogo competitivo',
  OUTROS: 'Outras',
}

export const ROTULOS_DE_FONTE: Record<FonteEnum, string> = {
  PNCP: 'PNCP',
  COMPRASNET: 'Compras.gov.br',
  NOVACAP: 'Novacap',
  FIEG: 'FIEG',
  SESC_GO: 'SESC GO',
  SEST_SENAT: 'SEST SENAT',
  SESC_REGIONAL: 'SESC (regionais)',
  QUERIDO_DIARIO: 'Diário oficial (Querido Diário)',
  SISTEMA_S: 'Sistema S (SENAI/SESI/SENAC)',
  INFRAERO: 'Infraero',
  DIARIO_MUNICIPAL: 'Diários municipais (associações)',
  TCE_CE: 'TCE-CE (municípios do Ceará)',
  TCE_PI: 'TCE-PI (municípios do Piauí)',
  TCE_TO: 'TCE-TO (municípios do Tocantins)',
  TCE_RS: 'TCE-RS (municípios do RS)',
  FAMEM: 'FAMEM (municípios do Maranhão)',
}

export const ROTULOS_DA_SITUACAO_DO_PLANO: Record<ParticipationStatusEnum, string> = {
  AVALIANDO: 'Avaliando',
  VOU_PARTICIPAR: 'Vou participar',
  NAO_VOU_PARTICIPAR: 'Não vou participar',
  PARTICIPEI: 'Participei',
}

export const CAMPOS_DA_LICITACAO_NA_PLANILHA = {
  id: true,
  fonte: true,
  modalidade: true,
  objeto: true,
  objetoResumido: true,
  orgao: true,
  municipio: true,
  uf: true,
  aberturaAt: true,
  encerramentoAt: true,
  valorEstimado: true,
  valorHomologado: true,
  linkEdital: true,
} satisfies Prisma.TenderSelect

export type LicitacaoDaPlanilha = Prisma.TenderGetPayload<{ select: typeof CAMPOS_DA_LICITACAO_NA_PLANILHA }>

export function prazoParaProposta(datas: DatasDaLicitacao): Date | null {
  if (datas.encerramentoAt) return datas.encerramentoAt
  if (aberturaEhInicioDasPropostas(datas.fonte)) return null
  return datas.aberturaAt
}

export function textoDaDataDaLicitacao(data: Date | null, fonte: string): string | null {
  return data ? formatarPrazoDaLicitacao(data, fonte) : null
}

export function cidadeEUf(t: { municipio: string | null; uf: string | null }): string | null {
  if (t.municipio) return t.uf ? `${t.municipio}/${t.uf}` : t.municipio
  return t.uf
}

function valorEmReais(valor: Prisma.Decimal | number | null): number | null {
  if (valor === null) return null
  const numero = Number(valor)
  return Number.isFinite(numero) ? numero : null
}

function prazoParaOrdenar(prazo: Date | null): number {
  return prazo ? prazo.getTime() : Number.POSITIVE_INFINITY
}

export interface MatchParaAgrupar {
  tenderId: string
  nomeDoItem: string
  dentroDeObraCompleta: boolean
  nota: number | null
  datas: DatasDaLicitacao
}

export interface LicitacaoComMatches {
  tenderId: string
  itens: string[]
  nota: number | null
  dentroDeObraCompleta: boolean
  prazo: Date | null
}

export function agruparMatchesPorLicitacao(matches: MatchParaAgrupar[]): LicitacaoComMatches[] {
  const porLicitacao = new Map<string, LicitacaoComMatches>()
  for (const m of matches) {
    const existente = porLicitacao.get(m.tenderId)
    if (!existente) {
      porLicitacao.set(m.tenderId, {
        tenderId: m.tenderId,
        itens: [m.nomeDoItem],
        nota: m.nota,
        dentroDeObraCompleta: m.dentroDeObraCompleta,
        prazo: prazoParaProposta(m.datas),
      })
      continue
    }
    if (!existente.itens.includes(m.nomeDoItem)) existente.itens.push(m.nomeDoItem)
    if (m.nota !== null && (existente.nota === null || m.nota > existente.nota)) existente.nota = m.nota
    existente.dentroDeObraCompleta = existente.dentroDeObraCompleta && m.dentroDeObraCompleta
  }
  return [...porLicitacao.values()].sort(
    (a, b) =>
      Number(a.dentroDeObraCompleta) - Number(b.dentroDeObraCompleta) ||
      prazoParaOrdenar(a.prazo) - prazoParaOrdenar(b.prazo) ||
      (a.tenderId < b.tenderId ? -1 : a.tenderId > b.tenderId ? 1 : 0)
  )
}

export const COLUNAS_DOS_MATCHES: ColunaDaPlanilha[] = [
  { titulo: 'Objeto', largura: 60 },
  { titulo: 'Órgão', largura: 40 },
  { titulo: 'Cidade/UF', largura: 24 },
  { titulo: 'Modalidade', largura: 22 },
  { titulo: 'Fonte', largura: 28 },
  { titulo: 'Prazo para proposta', largura: 19 },
  { titulo: 'Data da sessão', largura: 17 },
  { titulo: 'Valor estimado', largura: 18, tipo: 'moeda' },
  { titulo: 'Itens', largura: 32 },
  { titulo: 'Nota de aderência', largura: 12, tipo: 'numero' },
  { titulo: 'Dentro de obra completa', largura: 14 },
  { titulo: 'Link na Licita Bela', largura: 48 },
  { titulo: 'Link do edital', largura: 48 },
]

export const COLUNAS_DAS_ESCOLHIDAS: ColunaDaPlanilha[] = [
  { titulo: 'Objeto', largura: 60 },
  { titulo: 'Órgão', largura: 40 },
  { titulo: 'Cidade/UF', largura: 24 },
  { titulo: 'Situação do plano', largura: 20 },
  { titulo: 'Prazo para proposta', largura: 19 },
  { titulo: 'Data da sessão', largura: 17 },
  { titulo: 'Valor estimado', largura: 18, tipo: 'moeda' },
  { titulo: 'Valor homologado', largura: 18, tipo: 'moeda' },
  { titulo: 'Link na Licita Bela', largura: 48 },
  { titulo: 'Link do edital', largura: 48 },
]

function colunasComunsDoInicio(t: LicitacaoDaPlanilha): ValorDaCelula[] {
  return [t.objetoResumido ?? t.objeto, t.orgao, cidadeEUf(t)]
}

function datasDaLicitacao(t: LicitacaoDaPlanilha): ValorDaCelula[] {
  return [textoDaDataDaLicitacao(prazoParaProposta(t), t.fonte), textoDaDataDaLicitacao(dataDaSessao(t), t.fonte)]
}

export function linhaDoMatch(grupo: LicitacaoComMatches, t: LicitacaoDaPlanilha, linkNaLicitaBela: string): ValorDaCelula[] {
  return [
    ...colunasComunsDoInicio(t),
    ROTULOS_DE_MODALIDADE[t.modalidade] ?? t.modalidade,
    ROTULOS_DE_FONTE[t.fonte] ?? t.fonte,
    ...datasDaLicitacao(t),
    valorEmReais(t.valorEstimado),
    grupo.itens.join('; '),
    grupo.nota,
    grupo.dentroDeObraCompleta ? 'Sim' : 'Não',
    linkNaLicitaBela,
    t.linkEdital,
  ]
}

export function linhaDaEscolhida(status: ParticipationStatusEnum, t: LicitacaoDaPlanilha, linkNaLicitaBela: string): ValorDaCelula[] {
  return [
    ...colunasComunsDoInicio(t),
    ROTULOS_DA_SITUACAO_DO_PLANO[status] ?? status,
    ...datasDaLicitacao(t),
    valorEmReais(t.valorEstimado),
    valorEmReais(t.valorHomologado),
    linkNaLicitaBela,
    t.linkEdital,
  ]
}

export type CriterioDoCorte = 'prazo mais próximo' | 'atualizadas mais recentemente'

export function avisoDeListaCortada(quantidade: number, criterio: CriterioDoCorte): string {
  return `A planilha mostra só as ${quantidade.toLocaleString('pt-BR')} primeiras licitações (${criterio}). As demais continuam na Licita Bela.`
}
