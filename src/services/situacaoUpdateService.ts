// ============================================================
// services/situacaoUpdateService.ts — Atualiza a situação real de
// licitações do PNCP (a coleta só grava o status no momento da
// publicação, e o campo nunca era atualizado depois disso — todo
// registro ficava com o valor padrão ABERTA para sempre).
//
// Mapeamento de situacaoCompraId → SituacaoEnum determinado empiricamente
// (não documentado na API pública do PNCP) a partir dos valores observados
// nas licitações já coletadas. Se o PNCP retornar um id não mapeado aqui,
// a situação é mantida como estava e um aviso é registrado — mais seguro
// que adivinhar.
//
// Heurística adicional: o PNCP mantém situacaoCompraId=1 ("Divulgada no
// PNCP") mesmo depois que o prazo de recebimento de propostas já passou
// (não achamos um código de status separado pra "encerrada" na prática) —
// então tratamos isso localmente como ENCERRADA quando encerramentoAt já
// passou, pra essa informação não ficar sempre "Aberta" indefinidamente.
// ============================================================

import { SituacaoEnum } from '@prisma/client'
import { pncpClient } from '../lib/httpClient'
import { prisma } from './tenderService'

const SITUACAO_COMPRA_ID_MAP: Record<number, SituacaoEnum> = {
  1: 'ABERTA',
  2: 'REVOGADA',
  3: 'ANULADA',
  4: 'SUSPENSA',
}

// Situações terminais — uma vez atingidas, não faz sentido continuar
// reconsultando essa licitação periodicamente.
const TERMINAL: SituacaoEnum[] = ['ENCERRADA', 'HOMOLOGADA', 'CANCELADA', 'ANULADA', 'REVOGADA']

interface PNCPCompraStatus {
  situacaoCompraId: number
}

// Teto por execução: antes a varredura pegava TODAS as licitações não-terminais
// e fazia uma requisição sequencial por registro sob o rate limit de 1,2s — com
// 10 mil abertas isso passa de 3 horas, e como o intervalo é fixo em 12h a
// rotina nunca terminava antes da próxima começar.
export const SITUACAO_MAX_POR_EXECUCAO = Number(process.env.SITUACAO_MAX_POR_EXECUCAO ?? 500)

let varreduraEmAndamento = false

export async function refreshTenderSituacao(tenderId: string): Promise<boolean> {
  const tender = await prisma.tender.findUnique({
    where: { id: tenderId },
    select: { id: true, fonte: true, situacao: true, orgaoCnpj: true, encerramentoAt: true, rawJson: true },
  })
  if (!tender || tender.fonte !== 'PNCP' || !tender.orgaoCnpj) return false

  const raw = tender.rawJson as Record<string, unknown>
  const ano = raw.anoCompra as number | undefined
  const sequencial = raw.sequencialCompra as number | undefined
  if (!ano || !sequencial) return false

  const response = await pncpClient.get<PNCPCompraStatus>(
    `/v1/orgaos/${tender.orgaoCnpj}/compras/${ano}/${sequencial}`
  )

  const mapped = SITUACAO_COMPRA_ID_MAP[response.data.situacaoCompraId]
  if (!mapped) {
    console.warn(
      `[SituaçãoUpdate] situacaoCompraId desconhecido (${response.data.situacaoCompraId}) para tender ${tenderId} — mantendo situação atual.`
    )
    return false
  }

  const isPastDeadline = tender.encerramentoAt != null && tender.encerramentoAt.getTime() < Date.now()
  const next: SituacaoEnum = mapped === 'ABERTA' && isPastDeadline ? 'ENCERRADA' : mapped

  if (next === tender.situacao) return false

  await prisma.tender.update({ where: { id: tenderId }, data: { situacao: next } })
  return true
}

// Reconsulta todas as licitações do PNCP que ainda não estão em um estado
// terminal — chamada periodicamente pelo worker (ver workers/index.ts).
// Não usa fila do BullMQ de propósito: é uma varredura simples e o Redis
// já está no limite do plano gratuito (ver README/histórico do projeto).
export async function refreshAllOpenSituacoes(): Promise<{
  checked: number
  updated: number
  skipped: boolean
}> {
  // Sem essa trava, uma varredura longa e a próxima execução do intervalo
  // passam a rodar em paralelo e brigam pelo mesmo rate limit.
  if (varreduraEmAndamento) {
    console.warn('[SituaçãoUpdate] Varredura anterior ainda em andamento — pulando esta execução.')
    return { checked: 0, updated: 0, skipped: true }
  }
  varreduraEmAndamento = true

  try {
    // Rodízio: quem nunca foi conferido vem primeiro, depois quem foi conferido
    // há mais tempo; dentro disso, quem encerra antes. Assim cada execução
    // avança num pedaço diferente da base em vez de recomeçar do zero.
    const tenders = await prisma.tender.findMany({
      where: { fonte: 'PNCP', situacao: { notIn: TERMINAL } },
      select: { id: true },
      orderBy: [{ situacaoCheckedAt: { sort: 'asc', nulls: 'first' } }, { encerramentoAt: 'asc' }],
      take: SITUACAO_MAX_POR_EXECUCAO,
    })

    let updated = 0
    for (const t of tenders) {
      try {
        if (await refreshTenderSituacao(t.id)) updated++
      } catch (err) {
        console.error(`[SituaçãoUpdate] Erro ao atualizar tender ${t.id}:`, err instanceof Error ? err.message : err)
      } finally {
        // Marca mesmo quando a consulta falha, senão o mesmo registro problemático
        // seria escolhido de novo em toda execução e travaria o rodízio.
        await prisma.tender
          .update({ where: { id: t.id }, data: { situacaoCheckedAt: new Date() } })
          .catch(() => undefined)
      }
    }

    return { checked: tenders.length, updated, skipped: false }
  } finally {
    varreduraEmAndamento = false
  }
}
