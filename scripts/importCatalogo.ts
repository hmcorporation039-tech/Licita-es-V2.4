// ============================================================
// scripts/importCatalogo.ts — Importa o catálogo oficial (CATMAT = material,
// CATSER = serviço) da API dadosabertos.compras.gov.br para o cache local
// (tabela CatalogItem). Serve o autocomplete de códigos no cadastro de item
// monitorado (/api/catalog/search). Mesma ideia do importUasg.ts.
//
// Uso:
//   npx ts-node scripts/importCatalogo.ts            # material + serviço
//   npx ts-node scripts/importCatalogo.ts servico    # só serviço (rápido, 3k)
//   npx ts-node scripts/importCatalogo.ts material    # só material (~345k)
//
// Reexecutável: substitui todo o conteúdo do tipo importado.
// CATALOGO_MAX_PAGINAS limita as páginas (útil para um teste rápido).
// ============================================================

import axios from 'axios'
import { CatalogoTipo } from '@prisma/client'
import { prisma } from '../src/services/tenderService'
import { normalize } from '../src/lib/geoService'

const BASE_URL = 'https://dadosabertos.compras.gov.br'
const TAM_PAGINA = 500
const MAX_PAGINAS = process.env.CATALOGO_MAX_PAGINAS ? Number(process.env.CATALOGO_MAX_PAGINAS) : Infinity

interface CatalogoRegistro {
  codigo: string
  descricao: string
  grupo: string | null
  classe: string | null
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function baixarPaginas(path: string, mapear: (row: any) => CatalogoRegistro | null): Promise<CatalogoRegistro[]> {
  const todos: CatalogoRegistro[] = []
  let pagina = 1
  for (;;) {
    const { data } = await axios.get(`${BASE_URL}${path}`, {
      params: { pagina, tamanhoPagina: TAM_PAGINA },
      timeout: 60_000,
    })
    for (const row of data.resultado ?? []) {
      const reg = mapear(row)
      if (reg && reg.codigo && reg.descricao) todos.push(reg)
    }
    console.log(`  [${path}] página ${pagina}/${data.totalPaginas} — ${todos.length} itens`)
    if (pagina >= data.totalPaginas || pagina >= MAX_PAGINAS) break
    pagina += 1
    await new Promise((r) => setTimeout(r, 250))
  }
  return todos
}

async function gravar(tipo: CatalogoTipo, registros: CatalogoRegistro[]) {
  console.log(`Gravando ${registros.length} itens de ${tipo}...`)
  await prisma.catalogItem.deleteMany({ where: { tipo } })
  const LOTE = 1000
  for (let i = 0; i < registros.length; i += LOTE) {
    const lote = registros.slice(i, i + LOTE)
    await prisma.catalogItem.createMany({
      data: lote.map((r) => ({
        tipo,
        codigo: r.codigo,
        descricao: r.descricao,
        descricaoNorm: normalize(r.descricao),
        grupo: r.grupo,
        classe: r.classe,
      })),
      skipDuplicates: true,
    })
    console.log(`  ${Math.min(i + LOTE, registros.length)}/${registros.length}`)
  }
}

async function importarMaterial() {
  console.log('Baixando CATMAT (material)...')
  const itens = await baixarPaginas('/modulo-material/4_consultarItemMaterial', (row) => ({
    codigo: String(row.codigoItem),
    descricao: row.descricaoItem ?? '',
    grupo: row.nomeGrupo ?? null,
    classe: row.nomeClasse ?? null,
  }))
  await gravar('MATERIAL', itens)
}

async function importarServico() {
  console.log('Baixando CATSER (serviço)...')
  const itens = await baixarPaginas('/modulo-servico/6_consultarItemServico', (row) => ({
    codigo: String(row.codigoServico),
    descricao: row.nomeServico ?? '',
    grupo: row.nomeGrupo ?? null,
    classe: row.nomeClasse ?? null,
  }))
  await gravar('SERVICO', itens)
}

async function main() {
  const alvo = (process.argv[2] ?? '').toLowerCase()
  if (alvo === 'material') await importarMaterial()
  else if (alvo === 'servico') await importarServico()
  else {
    await importarServico() // pequeno primeiro
    await importarMaterial()
  }
  console.log('Catálogo importado.')
  await prisma.$disconnect()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
