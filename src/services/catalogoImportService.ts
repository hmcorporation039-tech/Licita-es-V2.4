// ============================================================
// services/catalogoImportService.ts — Importa, da API pública
// dadosabertos.compras.gov.br, os dados de apoio do cadastro de item
// monitorado: UASGs (unidades compradoras) e o catálogo CATMAT/CATSER.
//
// Usado por dois caminhos (mesma lógica):
//   - scripts/importUasg.ts e scripts/importCatalogo.ts (execução manual);
//   - services/catalogoBootstrap.ts (automático: popula no boot se a tabela
//     estiver vazia e renova periodicamente — dispensa rodar script à mão no
//     Railway, onde o banco só é acessível de dentro da rede do serviço).
//
// Reexecutável: tudo é upsert, nada é apagado. O catálogo é gravado página a
// página (500 itens por comando SQL) em vez de acumulado em memória — o CATMAT
// tem ~345 mil itens e a API do Railway tem memória limitada.
// ============================================================

import axios from 'axios'
import { CatalogoTipo } from '@prisma/client'
import { prisma } from './tenderService'
import { normalize } from '../lib/geoService'

const BASE_URL = 'https://dadosabertos.compras.gov.br'
const TAM_PAGINA = 500
const PAUSA_ENTRE_PAGINAS_MS = 250

type Log = (mensagem: string) => void

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

// Limite de páginas por importação — só para teste/amostra (nunca definir em
// produção): CATALOGO_MAX_PAGINAS=1 importa só a primeira página de cada fonte.
function maxPaginas(): number {
  const v = Number(process.env.CATALOGO_MAX_PAGINAS)
  return Number.isFinite(v) && v > 0 ? v : Infinity
}

// Percorre todas as páginas de um endpoint paginado da API, chamando
// `aoReceberPagina` a cada uma (sem acumular tudo em memória).
async function percorrerPaginas<T>(
  path: string,
  params: Record<string, string>,
  aoReceberPagina: (linhas: T[]) => Promise<void>,
  log: Log
): Promise<number> {
  let pagina = 1
  let total = 0
  for (;;) {
    const { data } = await axios.get(`${BASE_URL}${path}`, {
      params: { ...params, pagina, tamanhoPagina: TAM_PAGINA },
      timeout: 60_000,
    })
    const linhas: T[] = data.resultado ?? []
    await aoReceberPagina(linhas)
    total += linhas.length
    if (pagina === 1 || pagina % 20 === 0) log(`  [${path}] página ${pagina}/${data.totalPaginas} — ${total} registros`)
    if (pagina >= data.totalPaginas || pagina >= maxPaginas()) break
    pagina += 1
    await esperar(PAUSA_ENTRE_PAGINAS_MS)
  }
  return total
}

// ---------------------------------------------------------------- UASG

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

export async function importarUasgs(log: Log = console.log): Promise<number> {
  log('Baixando tabela de órgãos...')
  const orgaos: OrgaoRow[] = []
  await percorrerPaginas<OrgaoRow>(
    '/modulo-uasg/2_consultarOrgao',
    { statusOrgao: 'true' },
    async (linhas) => void orgaos.push(...linhas),
    log
  )
  const nomeOrgaoPorCodigo = new Map(orgaos.map((o) => [o.codigoOrgao, o.nomeOrgao]))

  log('Baixando tabela de UASGs...')
  let gravadas = 0
  await percorrerPaginas<UasgRow>(
    '/modulo-uasg/1_consultarUasg',
    { statusUasg: 'true' },
    async (linhas) => {
      const CONCORRENCIA = 20
      for (let i = 0; i < linhas.length; i += CONCORRENCIA) {
        await Promise.all(
          linhas.slice(i, i + CONCORRENCIA).map((u) => {
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
      }
      gravadas += linhas.length
    },
    log
  )
  log(`UASGs gravadas: ${gravadas}`)
  return gravadas
}

// ------------------------------------------------------------- Catálogo

interface ItemCatalogo {
  codigo: string
  descricao: string
  grupo: string | null
  classe: string | null
}

// Upsert de uma página inteira num único comando SQL (unnest das colunas).
// Duplicatas de código dentro da mesma página são descartadas antes, senão o
// Postgres recusa o ON CONFLICT ("cannot affect row a second time").
async function gravarPaginaCatalogo(tipo: CatalogoTipo, itens: ItemCatalogo[]) {
  const unicos = new Map<string, ItemCatalogo>()
  for (const item of itens) if (item.codigo && item.descricao) unicos.set(item.codigo, item)
  if (unicos.size === 0) return

  const lista = [...unicos.values()]
  await prisma.$executeRaw`
    INSERT INTO catalog_items (tipo, codigo, descricao, descricao_norm, grupo, classe, ativo, updated_at)
    SELECT ${tipo}::"CatalogoTipo", t.codigo, t.descricao, t.descricao_norm, NULLIF(t.grupo, ''), NULLIF(t.classe, ''), true, now()
    FROM unnest(
      ${lista.map((i) => i.codigo)}::text[],
      ${lista.map((i) => i.descricao)}::text[],
      ${lista.map((i) => normalize(i.descricao))}::text[],
      ${lista.map((i) => i.grupo ?? '')}::text[],
      ${lista.map((i) => i.classe ?? '')}::text[]
    ) AS t(codigo, descricao, descricao_norm, grupo, classe)
    ON CONFLICT (tipo, codigo) DO UPDATE SET
      descricao = EXCLUDED.descricao,
      descricao_norm = EXCLUDED.descricao_norm,
      grupo = EXCLUDED.grupo,
      classe = EXCLUDED.classe,
      ativo = true,
      updated_at = now()
  `
}

export async function importarCatalogo(
  tipo: 'material' | 'servico',
  log: Log = console.log
): Promise<number> {
  const enumTipo: CatalogoTipo = tipo === 'material' ? 'MATERIAL' : 'SERVICO'
  log(tipo === 'material' ? 'Baixando CATMAT (material)...' : 'Baixando CATSER (serviço)...')

  let gravados = 0
  if (tipo === 'material') {
    await percorrerPaginas<Record<string, unknown>>(
      '/modulo-material/4_consultarItemMaterial',
      {},
      async (linhas) => {
        await gravarPaginaCatalogo(
          enumTipo,
          linhas.map((r) => ({
            codigo: String(r.codigoItem ?? ''),
            descricao: String(r.descricaoItem ?? ''),
            grupo: (r.nomeGrupo as string) ?? null,
            classe: (r.nomeClasse as string) ?? null,
          }))
        )
        gravados += linhas.length
      },
      log
    )
  } else {
    await percorrerPaginas<Record<string, unknown>>(
      '/modulo-servico/6_consultarItemServico',
      {},
      async (linhas) => {
        await gravarPaginaCatalogo(
          enumTipo,
          linhas.map((r) => ({
            codigo: String(r.codigoServico ?? ''),
            descricao: String(r.nomeServico ?? ''),
            grupo: (r.nomeGrupo as string) ?? null,
            classe: (r.nomeClasse as string) ?? null,
          }))
        )
        gravados += linhas.length
      },
      log
    )
  }
  log(`Itens de ${tipo} gravados: ${gravados}`)
  return gravados
}
