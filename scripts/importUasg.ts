// ============================================================
// scripts/importUasg.ts — Importa a tabela de UASGs (unidades compradoras)
// da API pública dadosabertos.compras.gov.br pro cache local (tabela Uasg).
//
// Uso: npx ts-node scripts/importUasg.ts
// Reexecutável — faz upsert por codigoUasg, então pode rodar de novo pra
// atualizar (ex: uma vez por mês, via cron manual — não é dado que muda
// com frequência).
// ============================================================

import axios from 'axios'
import { prisma } from '../src/services/tenderService'
import { normalize } from '../src/lib/geoService'

const BASE_URL = 'https://dadosabertos.compras.gov.br'

interface OrgaoRow {
  codigoOrgao: number
  nomeOrgao: string
}

interface UasgRow {
  codigoUasg: string
  nomeUasg: string
  siglaUf: string | null
  nomeMunicipioIbge: string | null
  codigoOrgao: number | null
  cnpjCpfOrgao: string | null
  statusUasg: boolean
}

async function fetchAllPages<T>(path: string, params: Record<string, string>): Promise<T[]> {
  const all: T[] = []
  let pagina = 1
  while (true) {
    const { data } = await axios.get(`${BASE_URL}${path}`, { params: { ...params, pagina }, timeout: 30_000 })
    all.push(...(data.resultado ?? []))
    console.log(`  [${path}] página ${pagina}/${data.totalPaginas} — ${all.length}/${data.totalRegistros} registros`)
    if (pagina >= data.totalPaginas) break
    pagina += 1
    // Pequeno intervalo pra não martelar a API pública sem necessidade.
    await new Promise((r) => setTimeout(r, 300))
  }
  return all
}

async function main() {
  console.log('Baixando tabela de órgãos...')
  const orgaos = await fetchAllPages<OrgaoRow>('/modulo-uasg/2_consultarOrgao', { statusOrgao: 'true' })
  const nomeOrgaoPorCodigo = new Map(orgaos.map((o) => [o.codigoOrgao, o.nomeOrgao]))
  console.log(`${orgaos.length} órgãos carregados.`)

  console.log('Baixando tabela de UASGs...')
  const uasgs = await fetchAllPages<UasgRow>('/modulo-uasg/1_consultarUasg', { statusUasg: 'true' })
  console.log(`${uasgs.length} UASGs carregadas.`)

  console.log('Gravando no banco...')
  const CONCORRENCIA = 20
  let gravadas = 0
  for (let i = 0; i < uasgs.length; i += CONCORRENCIA) {
    const lote = uasgs.slice(i, i + CONCORRENCIA)
    await Promise.all(
      lote.map((u) => {
        const nomeOrgao = u.codigoOrgao != null ? nomeOrgaoPorCodigo.get(u.codigoOrgao) ?? null : null
        const data = {
          nomeUasg: u.nomeUasg,
          nomeUasgNorm: normalize(u.nomeUasg),
          siglaUf: u.siglaUf,
          municipioNome: u.nomeMunicipioIbge,
          codigoOrgao: u.codigoOrgao,
          nomeOrgao,
          nomeOrgaoNorm: nomeOrgao ? normalize(nomeOrgao) : null,
          cnpjOrgao: u.cnpjCpfOrgao,
          ativo: u.statusUasg,
        }
        return prisma.uasg.upsert({
          where: { codigoUasg: u.codigoUasg },
          update: data,
          create: { codigoUasg: u.codigoUasg, ...data },
        })
      })
    )
    gravadas += lote.length
    console.log(`  ${gravadas}/${uasgs.length} gravadas...`)
  }

  console.log(`Concluído: ${gravadas} UASGs gravadas.`)
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
