// ============================================================
// lib/licitacaoAberta.ts — O que conta como licitação ABERTA para concorrência.
// Regra única, usada nas buscas (lista de licitações, matches, dashboard) e no
// matcher: licitação encerrada, homologada ou antiga não aparece como oportunidade.
//
// Por que não basta `situacao = ABERTA`: a situação vem da origem e quase nunca
// é atualizada quando o prazo passa (o PNCP deixa dispensa/inexigibilidade em
// "Divulgada" mesmo depois de concluída). Então, além da situação:
//   1. Com prazo de proposta (encerramentoAt): aberta até esse momento.
//   2. Sem prazo, em portais onde `aberturaAt` é a data da SESSÃO (FIEG, SESC,
//      SEST SENAT, Novacap): aberta até o dia da sessão.
//   3. Sem nenhuma data útil (comum em dispensa do PNCP): aberta só se publicada
//      nos últimos DIAS_SEM_PRAZO dias — essas contratações são rápidas.
//   + Homologada (valorHomologado preenchido) nunca está aberta.
// ============================================================

import { FonteEnum, ModalidadeEnum, Prisma, SituacaoEnum } from '@prisma/client'
import { inicioDoDiaEmBrasilia } from './dataDeBrasilia'
import { FONTES_COM_ANO_NO_NUMERO, anoEmBrasilia } from './anoDoProcesso'
import { limiteDeDataPlausivel, prazoImprovavel } from './dataPlausivel'

export const DIAS_SEM_PRAZO = 30

// No PNCP e no ComprasNet, aberturaAt é o INÍCIO do recebimento de propostas (já
// passou numa licitação aberta), então não serve como prazo.
const FONTES_ABERTURA_E_INICIO: FonteEnum[] = ['PNCP', 'COMPRASNET']

function inicioDoDia(agora: Date): Date {
  return inicioDoDiaEmBrasilia(agora)
}

function semDataUtil(campo: 'encerramentoAt' | 'aberturaAt', limite: Date): Prisma.TenderWhereInput {
  const descartes: Prisma.TenderWhereInput[] = [{ [campo]: null }, { [campo]: { gt: limite } }]
  return { OR: campo === 'encerramentoAt' ? [...descartes, { prazoImprovavel: true }] : descartes }
}

function comPrazoConfirmado(agora: Date, limite: Date): Prisma.TenderWhereInput[] {
  return [
    { encerramentoAt: { gte: agora, lte: limite }, prazoImprovavel: false },
    {
      fonte: { notIn: FONTES_ABERTURA_E_INICIO },
      aberturaAt: { gte: inicioDoDia(agora), lte: limite },
      AND: [semDataUtil('encerramentoAt', limite)],
    },
  ]
}

export function whereLicitacaoAberta(agora: Date = new Date()): Prisma.TenderWhereInput {
  const limiteSemPrazo = new Date(agora.getTime() - DIAS_SEM_PRAZO * 86_400_000)
  const anoAtual = anoEmBrasilia(agora)
  const limite = limiteDeDataPlausivel(agora)
  return {
    situacao: 'ABERTA',
    valorHomologado: null,
    duplicataDe: null,
    motivoOculta: null,
    OR: [
      ...comPrazoConfirmado(agora, limite),
      {
        fonte: { notIn: FONTES_COM_ANO_NO_NUMERO },
        AND: [
          semDataUtil('encerramentoAt', limite),
          { OR: [{ fonte: { in: FONTES_ABERTURA_E_INICIO } }, semDataUtil('aberturaAt', limite)] },
          { OR: [{ publicadoAt: { gte: limiteSemPrazo } }, { publicadoAt: null, createdAt: { gte: limiteSemPrazo } }] },
        ],
      },
      {
        fonte: { in: FONTES_COM_ANO_NO_NUMERO },
        AND: [semDataUtil('encerramentoAt', limite), semDataUtil('aberturaAt', limite)],
        OR: [
          { publicadoAt: { gte: limiteSemPrazo }, OR: [{ anoDoProcesso: null }, { anoDoProcesso: { gte: anoAtual } }] },
          { publicadoAt: null, anoDoProcesso: { gte: anoAtual } },
        ],
      },
    ],
  }
}

export function whereLicitacaoComPrazoConfirmado(agora: Date = new Date()): Prisma.TenderWhereInput {
  return {
    situacao: 'ABERTA',
    valorHomologado: null,
    duplicataDe: null,
    motivoOculta: null,
    OR: comPrazoConfirmado(agora, limiteDeDataPlausivel(agora)),
  }
}

export interface DatasDaLicitacao {
  fonte: FonteEnum
  modalidade?: ModalidadeEnum | null
  situacao: SituacaoEnum
  valorHomologado: unknown
  encerramentoAt: Date | null
  aberturaAt: Date | null
  publicadoAt: Date | null
  createdAt: Date
  anoDoProcesso?: number | null
  duplicataDe?: string | null
  motivoOculta?: string | null
}

function dentroDoLimite(data: Date | null, limite: Date): Date | null {
  return data && data.getTime() <= limite.getTime() ? data : null
}

// Mesma regra de whereLicitacaoAberta, para quem já tem a licitação em memória.
export function estaAberta(t: DatasDaLicitacao, agora: Date = new Date()): boolean {
  if (t.situacao !== 'ABERTA' || (t.valorHomologado !== null && t.valorHomologado !== undefined)) return false
  if (t.duplicataDe || t.motivoOculta) return false
  const limite = limiteDeDataPlausivel(agora)
  const encerramento = prazoImprovavel(t) ? null : dentroDoLimite(t.encerramentoAt, limite)
  const abertura = dentroDoLimite(t.aberturaAt, limite)
  if (encerramento) return encerramento.getTime() >= agora.getTime()
  if (abertura && !FONTES_ABERTURA_E_INICIO.includes(t.fonte)) return abertura.getTime() >= inicioDoDia(agora).getTime()
  const limiteSemPrazo = agora.getTime() - DIAS_SEM_PRAZO * 86_400_000
  if (!FONTES_COM_ANO_NO_NUMERO.includes(t.fonte)) return (t.publicadoAt ?? t.createdAt).getTime() >= limiteSemPrazo
  const ano = t.anoDoProcesso ?? null
  if (ano !== null && ano < anoEmBrasilia(agora)) return false
  if (t.publicadoAt) return t.publicadoAt.getTime() >= limiteSemPrazo
  return ano !== null
}
