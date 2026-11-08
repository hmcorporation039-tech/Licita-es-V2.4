// ============================================================
// services/contratosPublicosColeta.ts — Coleta diária dos contratos assinados
// publicados no PNCP (API pública de consulta), para a tela "Obras e ganhadores".
// Guarda só o que serve para oferecer serviço ao ganhador: pessoa jurídica,
// obras e serviços (não compras de material), acima de um valor mínimo.
// Recoleta hoje e ontem a cada execução; os dias anteriores, uma vez só.
// ============================================================

import axios from 'axios'
import { prisma, saveWorkerLog } from './tenderService'
import { findMunicipioByNomeUf, getMunicipioByIbge, normalize } from '../lib/geoService'
import { diaEmBrasilia, somarDias, type Dia } from '../lib/diasUteis'
import { municipioCitado } from '../lib/localDeExecucao'

const URL = 'https://pncp.gov.br/api/consulta/v1/contratos'
const TAMANHO_PAGINA = 500
export const DIAS_PARA_TRAS = 60
export const RETENCAO_DIAS = 180
export const VALOR_MINIMO_GUARDADO = 5_000
const PAUSA_MS = 1_200
const MAX_PAGINAS_POR_EXECUCAO = Number(process.env.CONTRATOS_MAX_PAGINAS) > 0 ? Number(process.env.CONTRATOS_MAX_PAGINAS) : 120
export const WORKER_DOS_CONTRATOS = 'contratos-pncp'

// Categorias do processo em que o ganhador executa algo e pode precisar de terceiros.
export const CATEGORIAS_GUARDADAS = new Set(['Obras', 'Serviços de Engenharia', 'Serviços', 'Mão de Obra'])

type Bruto = Record<string, unknown>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Bruto => (v && typeof v === 'object' ? (v as Bruto) : {})
const data = (v: unknown): Date | null => {
  const s = txt(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? new Date(`${s}T00:00:00Z`) : null
}

export interface ContratoParaGravar {
  id: string
  compraControle: string | null
  orgaoCnpj: string
  orgaoNome: string
  uf: string | null
  municipio: string | null
  municipioIbge: string | null
  lat: number | null
  lng: number | null
  fornecedorNi: string
  fornecedorNome: string
  objeto: string
  objetoNorm: string
  valorGlobal: number
  categoria: string | null
  tipo: string | null
  dataAssinatura: Date | null
  vigenciaFim: Date | null
  publicadoEm: Date | null
}

/** Converte um contrato da API e diz se ele vale ser guardado. */
export function contratoParaGravar(bruto: unknown): ContratoParaGravar | null {
  const c = obj(bruto)
  const id = txt(c.numeroControlePNCP)
  const ni = txt(c.niFornecedor).replace(/\D/g, '')
  if (!id || txt(c.tipoPessoa) !== 'PJ' || ni.length !== 14 || c.receita === true) return null
  const categoria = txt(obj(c.categoriaProcesso).nome) || null
  if (!categoria || !CATEGORIAS_GUARDADAS.has(categoria)) return null
  const valor = Number(c.valorGlobal)
  if (!Number.isFinite(valor) || valor < VALOR_MINIMO_GUARDADO) return null
  const objeto = txt(c.objetoContrato).replace(/\s+/g, ' ')
  if (!objeto) return null
  const org = obj(c.orgaoEntidade)
  const uni = obj(c.unidadeOrgao)
  const ibge = txt(uni.codigoIbge) || null
  const doOrgao = ibge ? getMunicipioByIbge(ibge) : undefined
  // O PNCP dá a cidade do órgão; a obra pode ser em outra ("… CAMPINAS/SP"). Vale a citada no objeto.
  const citado = municipioCitado([objeto], txt(uni.ufSigla) || doOrgao?.uf || null)
  const municipio = citado ? { nome: citado.nome, uf: citado.uf, lat: citado.lat, lng: citado.lng } : doOrgao
  const publicado = txt(c.dataPublicacaoPncp)
  return {
    id,
    compraControle: txt(c.numeroControlePncpCompra) || null,
    orgaoCnpj: txt(org.cnpj),
    orgaoNome: txt(org.razaoSocial) || txt(uni.nomeUnidade),
    uf: (citado?.uf || txt(uni.ufSigla) || doOrgao?.uf || '').slice(0, 2).toUpperCase() || null,
    municipio: citado ? nomeLegivel(citado.nome) : txt(uni.municipioNome) || doOrgao?.nome || null,
    municipioIbge: citado ? (findMunicipioByNomeUf(citado.nome, citado.uf)?.codigoIbge ?? null) : ibge,
    lat: municipio?.lat ?? null,
    lng: municipio?.lng ?? null,
    fornecedorNi: ni,
    fornecedorNome: txt(c.nomeRazaoSocialFornecedor).slice(0, 300),
    objeto: objeto.slice(0, 4000),
    objetoNorm: textoParaBusca(objeto),
    valorGlobal: Math.round(valor * 100) / 100,
    categoria,
    tipo: txt(obj(c.tipoContrato).nome) || null,
    dataAssinatura: data(c.dataAssinatura),
    vigenciaFim: data(c.dataVigenciaFim),
    publicadoEm: publicado && !Number.isNaN(Date.parse(publicado)) ? new Date(publicado) : null,
  }
}

// Alguns órgãos publicam o texto com "ã" trocado por "?" ("Contratac?o", "m?o de obra").
// Na busca, "?" entre letras vira "a": recupera "contratacao" e "mao de obra".
export function textoParaBusca(objeto: string): string {
  return normalize(objeto).replace(/(?<=\p{L})\?(?=\p{L})/gu, 'a').slice(0, 4000)
}

// "CAMPINAS" / "sao jose dos campos" -> "Campinas" / "Sao Jose dos Campos"
function nomeLegivel(nome: string): string {
  return nome
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)(\p{L})/gu, (_, espaco: string, letra: string) => espaco + letra.toLocaleUpperCase('pt-BR'))
    .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLocaleLowerCase('pt-BR'))
}

export type BuscarPagina = (dia: Dia, pagina: number) => Promise<{ data: unknown[]; totalPaginas: number; totalRegistros: number }>

const buscarPaginaPadrao: BuscarPagina = async (dia, pagina) => {
  const aaaammdd = dia.replace(/-/g, '')
  const r = await axios.get(URL, {
    params: { dataInicial: aaaammdd, dataFinal: aaaammdd, pagina, tamanhoPagina: TAMANHO_PAGINA },
    timeout: 60_000,
    headers: { Accept: 'application/json', 'User-Agent': 'LicitaBela/1.0 (contratos publicos)' },
    validateStatus: (s) => s === 200 || s === 204,
  })
  if (r.status === 204 || !r.data) return { data: [], totalPaginas: 0, totalRegistros: 0 }
  const corpo = r.data as { data?: unknown[]; totalPaginas?: number; totalRegistros?: number }
  return { data: Array.isArray(corpo.data) ? corpo.data : [], totalPaginas: Number(corpo.totalPaginas) || 0, totalRegistros: Number(corpo.totalRegistros) || 0 }
}

const esperar = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Dias a coletar nesta execução: hoje e ontem sempre; os anteriores até completar. */
export function diasParaColetar(hoje: Dia, completos: Set<Dia>): Dia[] {
  const dias: Dia[] = []
  for (let i = 0; i <= DIAS_PARA_TRAS; i++) {
    const dia = somarDias(hoje, -i)
    if (i <= 1 || !completos.has(dia)) dias.push(dia)
  }
  return dias
}

export interface ResumoDosContratos {
  dias: number
  paginas: number
  gravados: number
  parouNoTeto: boolean
  falhas: string[]
}

export async function coletarContratosPublicos(opcoes: { agora?: Date; buscar?: BuscarPagina; pausaMs?: number; maxPaginas?: number } = {}): Promise<ResumoDosContratos> {
  const buscar = opcoes.buscar ?? buscarPaginaPadrao
  const pausa = opcoes.pausaMs ?? PAUSA_MS
  const maxPaginas = opcoes.maxPaginas ?? MAX_PAGINAS_POR_EXECUCAO
  const hoje = diaEmBrasilia(opcoes.agora ?? new Date())
  const registros = await prisma.coletaDeContratosDia.findMany({ where: { completa: true }, select: { dia: true } })
  const completos = new Set<Dia>(registros.map((r) => r.dia.toISOString().slice(0, 10)))
  const resumo: ResumoDosContratos = { dias: 0, paginas: 0, gravados: 0, parouNoTeto: false, falhas: [] }

  for (const dia of diasParaColetar(hoje, completos)) {
    if (resumo.paginas >= maxPaginas) {
      resumo.parouNoTeto = true
      break
    }
    let pagina = 1
    let totalPaginas = 1
    let total = 0
    let gravadosNoDia = 0
    let completo = true
    while (pagina <= totalPaginas) {
      if (resumo.paginas >= maxPaginas) {
        resumo.parouNoTeto = true
        completo = false
        break
      }
      try {
        const r = await buscar(dia, pagina)
        resumo.paginas++
        totalPaginas = r.totalPaginas
        total = r.totalRegistros
        const contratos = r.data.map(contratoParaGravar).filter((c): c is ContratoParaGravar => c !== null)
        if (contratos.length > 0) {
          const { count } = await prisma.contratoPublico.createMany({ data: contratos, skipDuplicates: true })
          gravadosNoDia += count
        }
      } catch (err) {
        completo = false
        resumo.falhas.push(`${dia} p.${pagina}: ${axios.isAxiosError(err) ? (err.response?.status ?? err.code ?? 'sem resposta') : err instanceof Error ? err.message : 'erro'}`)
        break
      }
      pagina++
      if (pausa > 0) await esperar(pausa)
    }
    resumo.dias++
    resumo.gravados += gravadosNoDia
    // Hoje e ontem ainda recebem publicações: nunca ficam "completos".
    const recente = dia >= somarDias(hoje, -1)
    await prisma.coletaDeContratosDia.upsert({
      where: { dia: new Date(`${dia}T00:00:00Z`) },
      create: { dia: new Date(`${dia}T00:00:00Z`), total, gravados: gravadosNoDia, completa: completo && !recente },
      update: { total, gravados: { increment: gravadosNoDia }, completa: completo && !recente },
    })
    if (resumo.falhas.length >= 3) break
  }

  const limite = new Date(`${somarDias(hoje, -RETENCAO_DIAS)}T00:00:00Z`)
  await prisma.contratoPublico.deleteMany({ where: { OR: [{ dataAssinatura: { lt: limite } }, { dataAssinatura: null, createdAt: { lt: limite } }] } })
  await prisma.coletaDeContratosDia.deleteMany({ where: { dia: { lt: limite } } })
  return resumo
}

export async function coletarContratosComLog(): Promise<ResumoDosContratos> {
  const startedAt = new Date()
  const resumo = await coletarContratosPublicos()
  await saveWorkerLog({
    worker: WORKER_DOS_CONTRATOS,
    status: resumo.falhas.length > 0 ? 'PARTIAL' : 'SUCCESS',
    totalFetched: resumo.paginas,
    totalNew: resumo.gravados,
    errorMsg: [...(resumo.parouNoTeto ? ['parou no teto de páginas; continua na próxima execução'] : []), ...resumo.falhas.slice(0, 10)].join('; ') || undefined,
    startedAt,
    finishedAt: new Date(),
  })
  console.log(`[Contratos PNCP] ${resumo.dias} dia(s), ${resumo.paginas} página(s), ${resumo.gravados} contrato(s) novo(s), ${resumo.falhas.length} falha(s).`)
  return resumo
}
