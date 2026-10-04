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

import { FonteEnum, Prisma, SituacaoEnum } from '@prisma/client'

export const DIAS_SEM_PRAZO = 30

// No PNCP e no ComprasNet, aberturaAt é o INÍCIO do recebimento de propostas (já
// passou numa licitação aberta), então não serve como prazo.
const FONTES_ABERTURA_E_INICIO: FonteEnum[] = ['PNCP', 'COMPRASNET']

function inicioDoDia(agora: Date): Date {
  const d = new Date(agora)
  d.setHours(0, 0, 0, 0)
  return d
}

export function whereLicitacaoAberta(agora: Date = new Date()): Prisma.TenderWhereInput {
  const limiteSemPrazo = new Date(agora.getTime() - DIAS_SEM_PRAZO * 86_400_000)
  return {
    situacao: 'ABERTA',
    valorHomologado: null,
    OR: [
      { encerramentoAt: { gte: agora } },
      { encerramentoAt: null, fonte: { notIn: FONTES_ABERTURA_E_INICIO }, aberturaAt: { gte: inicioDoDia(agora) } },
      {
        encerramentoAt: null,
        OR: [{ fonte: { in: FONTES_ABERTURA_E_INICIO } }, { aberturaAt: null }],
        AND: [{ OR: [{ publicadoAt: { gte: limiteSemPrazo } }, { publicadoAt: null, createdAt: { gte: limiteSemPrazo } }] }],
      },
    ],
  }
}

export interface DatasDaLicitacao {
  fonte: FonteEnum
  situacao: SituacaoEnum
  valorHomologado: unknown
  encerramentoAt: Date | null
  aberturaAt: Date | null
  publicadoAt: Date | null
  createdAt: Date
}

// Mesma regra de whereLicitacaoAberta, para quem já tem a licitação em memória.
export function estaAberta(t: DatasDaLicitacao, agora: Date = new Date()): boolean {
  if (t.situacao !== 'ABERTA' || (t.valorHomologado !== null && t.valorHomologado !== undefined)) return false
  if (t.encerramentoAt) return t.encerramentoAt.getTime() >= agora.getTime()
  if (t.aberturaAt && !FONTES_ABERTURA_E_INICIO.includes(t.fonte)) return t.aberturaAt.getTime() >= inicioDoDia(agora).getTime()
  const referencia = t.publicadoAt ?? t.createdAt
  return referencia.getTime() >= agora.getTime() - DIAS_SEM_PRAZO * 86_400_000
}
