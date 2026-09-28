// ============================================================
// scripts/sescGoBackfillAnexos.ts — Preenche rawJson.anexos das licitações
// da SESC GO já coletadas antes do commit que passou a capturar isso
// (5f3d675, "Generaliza a análise de edital por IA além do PNCP").
//
// Por quê precisa de um script à parte: o dedupe do coletor (saveTender)
// decide se atualiza um registro comparando um hash que NÃO inclui rawJson
// (ver lib/tenderContentHash.ts — de propósito, é só sobre o que muda a
// decisão de participar). Então uma licitação cujo objeto/valor/data não
// mudaram desde a v1 do parser nunca teve o rawJson reescrito, mesmo
// passando pela coleta de novo todo dia — ficava com `{}` pra sempre.
// Sintoma: "Ver edital" funciona (linkEdital foi capturado desde o
// início), mas a análise por IA diz "nenhum documento disponível".
//
// Idempotente: só toca licitação com rawJson sem anexos, então pode rodar
// mais de uma vez sem problema.
//
// Uso: npx ts-node scripts/sescGoBackfillAnexos.ts
// ============================================================

import { prisma } from '../src/services/tenderService'
import { sescGoClient } from '../src/lib/httpClient'
import { parseSescGoListagem } from '../src/services/sescGoParser'

async function main() {
  console.log('Buscando listagem da SESC GO...')
  const response = await sescGoClient.get('/licitacoes')
  const tenders = parseSescGoListagem(response.data)
  console.log(`${tenders.length} licitação(ões) na listagem atual.`)

  let atualizados = 0
  let semAnexoNaFonte = 0
  let jaEstavaOk = 0
  let naoEncontrados = 0

  for (const tender of tenders) {
    const anexos = (tender.rawJson as { anexos?: unknown[] }).anexos ?? []
    if (anexos.length === 0) {
      semAnexoNaFonte++
      continue
    }

    const existing = await prisma.tender.findUnique({
      where: { fonteId: tender.fonteId },
      select: { id: true, rawJson: true },
    })
    if (!existing) {
      naoEncontrados++
      continue
    }

    const jaTinhaAnexos = ((existing.rawJson as { anexos?: unknown[] } | null)?.anexos ?? []).length > 0
    if (jaTinhaAnexos) {
      jaEstavaOk++
      continue
    }

    await prisma.tender.update({ where: { id: existing.id }, data: { rawJson: tender.rawJson as object } })
    atualizados++
  }

  console.log(
    `Concluído — ${atualizados} atualizado(s), ${jaEstavaOk} já estava(m) ok, ` +
      `${semAnexoNaFonte} sem anexo na própria fonte, ${naoEncontrados} não encontrado(s) no banco (fora da retenção).`
  )
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
