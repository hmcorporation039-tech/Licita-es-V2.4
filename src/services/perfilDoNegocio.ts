// ============================================================
// services/perfilDoNegocio.ts — "O que a sua empresa vende?": a partir do CNPJ
// (atividades no cadastro da Receita, via BrasilAPI) e/ou de uma descrição livre,
// sugere itens monitorados (nome + palavras-chave + palavras de exclusão). Só
// sugere: quem cria os itens é a pessoa, escolhendo na tela.
//
// Com IA configurada, a sugestão vem da IA (só palavras, nunca códigos ou
// valores). Sem IA, as atividades do CNPJ viram itens por uma regra simples.
// ============================================================

import { temPalavraSignificativa } from '../lib/matching'
import { atendimentoHabilitado, consultarGemini, modeloDoAtendimento, type Consultor } from './atendimento'
import { registrarUsoDeIa, type QuemPediu } from './aiUsageService'
import { ErroComUso } from './llm/types'

export interface AtividadeDaEmpresa {
  codigo: string
  descricao: string
  principal: boolean
}

export interface EmpresaDoCnpj {
  cnpj: string
  razaoSocial: string
  nomeFantasia: string | null
  uf: string | null
  municipio: string | null
  atividades: AtividadeDaEmpresa[]
  /** Contato público do cadastro na Receita (pode estar desatualizado). */
  telefones?: string[]
  email?: string | null
  situacao?: string | null
}

export interface ItemSugerido {
  nome: string
  palavrasChave: string[]
  palavrasDeExclusao: string[]
  motivo: string
}

export class CnpjNaoEncontrado extends Error {}
export class CnpjIndisponivel extends Error {}

type BuscarJson = (url: string) => Promise<unknown>

async function buscarJson(url: string): Promise<unknown> {
  // A BrasilAPI recusa (403) pedido sem User-Agent, que é o padrão do fetch do Node.
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { Accept: 'application/json', 'User-Agent': 'LicitaBela/1.0 (consulta de CNPJ)' } })
  if (res.status === 404 || res.status === 400) return null
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  return res.json()
}

export function normalizarCnpj(valor: string): string | null {
  const d = (valor ?? '').replace(/\D/g, '')
  return d.length === 14 ? d : null
}

const texto = (v: unknown, max = 200): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '')

function cidadeLegivel(nome: string): string {
  return nome
    .toLocaleLowerCase('pt-BR')
    .replace(/(^|\s)(\p{L})/gu, (_, espaco: string, letra: string) => espaco + letra.toLocaleUpperCase('pt-BR'))
    .replace(/\s(De|Da|Do|Das|Dos|E)\s/g, (m) => m.toLocaleLowerCase('pt-BR'))
}

export function empresaDaBrasilApi(cnpj: string, j: unknown): EmpresaDoCnpj | null {
  if (!j || typeof j !== 'object') return null
  const o = j as Record<string, unknown>
  const razaoSocial = texto(o.razao_social)
  if (!razaoSocial) return null
  const atividades: AtividadeDaEmpresa[] = []
  const principal = texto(o.cnae_fiscal_descricao)
  if (principal) atividades.push({ codigo: String(o.cnae_fiscal ?? ''), descricao: principal, principal: true })
  for (const s of Array.isArray(o.cnaes_secundarios) ? o.cnaes_secundarios.slice(0, 30) : []) {
    const r = s as Record<string, unknown>
    const descricao = texto(r.descricao)
    // A Receita grava "Não informada" quando a empresa não tem atividade secundária.
    if (descricao && !/^n[aã]o informad/i.test(descricao) && Number(r.codigo) > 0) atividades.push({ codigo: String(r.codigo), descricao, principal: false })
  }
  const uf = texto(o.uf, 2).toUpperCase()
  const municipio = texto(o.municipio, 120)
  return {
    cnpj,
    razaoSocial,
    nomeFantasia: texto(o.nome_fantasia) || null,
    uf: uf.length === 2 ? uf : null,
    municipio: municipio ? cidadeLegivel(municipio) : null,
    atividades,
    telefones: [o.ddd_telefone_1, o.ddd_telefone_2].map((t) => telefoneLegivel(texto(t, 20))).filter((t): t is string => t !== null),
    email: emailValido(texto(o.email, 120)),
    situacao: texto(o.descricao_situacao_cadastral, 40) || null,
  }
}

function telefoneLegivel(bruto: string): string | null {
  const d = bruto.replace(/\D/g, '')
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`
  return null
}

function emailValido(bruto: string): string | null {
  const e = bruto.toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null
}

const cache = new Map<string, { em: number; valor: EmpresaDoCnpj }>()
const VALIDADE_MS = 24 * 60 * 60 * 1000

export async function consultarCnpj(valor: string, buscar: BuscarJson = buscarJson, agora = Date.now()): Promise<EmpresaDoCnpj> {
  const cnpj = normalizarCnpj(valor)
  if (!cnpj) throw new CnpjNaoEncontrado('CNPJ inválido: informe os 14 dígitos.')
  const guardado = cache.get(cnpj)
  if (guardado && agora - guardado.em < VALIDADE_MS) return guardado.valor
  let bruto: unknown
  try {
    bruto = await buscar(`https://brasilapi.com.br/api/cnpj/v1/${cnpj}`)
  } catch {
    throw new CnpjIndisponivel('A consulta de CNPJ não respondeu agora. Tente de novo em instantes ou descreva o que a empresa vende.')
  }
  const empresa = empresaDaBrasilApi(cnpj, bruto)
  if (!empresa) throw new CnpjNaoEncontrado('CNPJ não encontrado na Receita.')
  cache.set(cnpj, { em: agora, valor: empresa })
  return empresa
}

// ---------- Sem IA: atividade do CNPJ -> item ----------

// "Comércio atacadista de equipamentos de informática" -> "equipamentos de informática".
const PREFIXOS_DE_ATIVIDADE =
  /^(com[eé]rcio (atacadista|varejista)( especializado)?( de| em)?|fabrica[cç][aã]o de|servi[cç]os? (combinados )?de|atividades? de|instala[cç][aã]o e manuten[cç][aã]o (el[eé]trica )?de|manuten[cç][aã]o e repara[cç][aã]o de|repara[cç][aã]o e manuten[cç][aã]o de|aluguel de|loca[cç][aã]o de|constru[cç][aã]o de|obras de|confec[cç][aã]o de|produ[cç][aã]o de|desenvolvimento de|prepara[cç][aã]o de|transporte rodovi[aá]rio de|com[eé]rcio de)\s+/i
const SUFIXOS_VAZIOS = /[,;]?\s*(n[aã]o especificad[oa]s? anteriormente|exceto [^,;]+|e similares|e outros|em geral|para uso [^,;]+|com [^,;]+|sem [^,;]+)$/i

function nomeDaAtividade(descricao: string): string {
  let t = descricao.replace(/\s+/g, ' ').trim()
  for (let i = 0; i < 2; i++) t = t.replace(SUFIXOS_VAZIOS, '').trim()
  t = t.replace(/^outr[ao]s\s+/i, '').replace(PREFIXOS_DE_ATIVIDADE, '').trim()
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1)
}

function chaveDaAtividade(nome: string): string[] {
  // Partes separadas por vírgula ou " e " viram palavras-chave próprias ("ferragens, ferramentas e materiais elétricos").
  const partes = nome
    .toLocaleLowerCase('pt-BR')
    .split(/,\s*|\s+e\s+(?=[a-zà-ú]{4})/)
    .map((p) => p.trim())
    .filter((p) => p.length >= 4 && temPalavraSignificativa(p))
  return [...new Set(partes)].slice(0, 5)
}

export function itensPelasAtividades(atividades: AtividadeDaEmpresa[], limite = 6): ItemSugerido[] {
  const itens: ItemSugerido[] = []
  const vistos = new Set<string>()
  for (const a of [...atividades].sort((x, y) => Number(y.principal) - Number(x.principal))) {
    const nome = nomeDaAtividade(a.descricao)
    const palavrasChave = chaveDaAtividade(nome)
    const chave = palavrasChave.join('|')
    if (palavrasChave.length === 0 || vistos.has(chave)) continue
    vistos.add(chave)
    itens.push({ nome: nome.slice(0, 80), palavrasChave, palavrasDeExclusao: [], motivo: `Atividade ${a.principal ? 'principal' : 'secundária'} no CNPJ: ${a.descricao}` })
    if (itens.length >= limite) break
  }
  return itens
}

// ---------- Com IA ----------

const INSTRUCAO = `Você ajuda uma empresa brasileira a monitorar licitações públicas.
Recebe o que a empresa vende (descrição livre e/ou atividades CNAE do CNPJ) e devolve de 2 a 6 itens monitorados.
Cada item é uma linha de produto ou serviço que órgãos públicos COMPRAM, com:
- nome: curto (até 6 palavras), como a empresa chamaria a linha;
- palavrasChave: 2 a 6 termos como aparecem no OBJETO de editais (ex.: "câmeras de segurança", "cftv", "videomonitoramento"); singular ou plural, sem códigos, sem nomes de marca, sem termos genéricos como "serviços", "materiais", "aquisição";
- palavrasDeExclusao: 0 a 4 termos que trazem licitações erradas para esse item (ex.: para "pneus" excluir "recapagem" só se a empresa não faz);
- motivo: uma frase dizendo de onde veio (da descrição ou de qual atividade).
Não invente linhas que a empresa não citou nem tem no CNPJ. Não use valores, datas ou códigos CATMAT. Escreva em português do Brasil.`

const SCHEMA = {
  type: 'object',
  properties: {
    itens: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          nome: { type: 'string' },
          palavrasChave: { type: 'array', items: { type: 'string' } },
          palavrasDeExclusao: { type: 'array', items: { type: 'string' } },
          motivo: { type: 'string' },
        },
        required: ['nome', 'palavrasChave', 'palavrasDeExclusao', 'motivo'],
      },
    },
  },
  required: ['itens'],
}

function listaDeTermos(v: unknown, max: number): string[] {
  if (!Array.isArray(v)) return []
  const termos = v
    .map((t) => texto(t, 60).toLocaleLowerCase('pt-BR').replace(/["“”]/g, ''))
    .filter((t) => t.length >= 2 && !/\d{5,}/.test(t) && temPalavraSignificativa(t))
  return [...new Set(termos)].slice(0, max)
}

export function validarSugestoes(bruto: unknown): ItemSugerido[] {
  const itens = (bruto as { itens?: unknown })?.itens
  if (!Array.isArray(itens)) return []
  const out: ItemSugerido[] = []
  for (const i of itens.slice(0, 6)) {
    const o = (i ?? {}) as Record<string, unknown>
    const nome = texto(o.nome, 80)
    const palavrasChave = listaDeTermos(o.palavrasChave, 6)
    if (!nome || palavrasChave.length === 0) continue
    const exclusao = listaDeTermos(o.palavrasDeExclusao, 4).filter((t) => !palavrasChave.includes(t))
    out.push({ nome, palavrasChave, palavrasDeExclusao: exclusao, motivo: texto(o.motivo, 200) })
  }
  return out
}

export function textoParaIa(descricao: string | null, empresa: EmpresaDoCnpj | null): string {
  const partes: string[] = []
  if (descricao) partes.push(`O que a empresa diz que vende:\n${descricao}`)
  if (empresa?.atividades.length) {
    partes.push(
      'Atividades no CNPJ:\n' + empresa.atividades.map((a) => `- ${a.descricao}${a.principal ? ' (principal)' : ''}`).join('\n')
    )
  }
  return partes.join('\n\n')
}

export interface ResultadoDoPerfil {
  empresa: EmpresaDoCnpj | null
  sugestoes: ItemSugerido[]
  origem: 'ia' | 'atividades'
}

export async function sugerirItensDoNegocio(args: {
  descricao?: string | null
  cnpj?: string | null
  quem?: QuemPediu
  consultar?: Consultor<unknown>
  buscar?: BuscarJson
  iaHabilitada?: boolean
}): Promise<ResultadoDoPerfil> {
  const descricao = texto(args.descricao, 1500) || null
  const empresa = args.cnpj ? await consultarCnpj(args.cnpj, args.buscar) : null
  if (!descricao && !empresa?.atividades.length) return { empresa, sugestoes: [], origem: 'atividades' }

  const iaHabilitada = args.iaHabilitada ?? atendimentoHabilitado()
  if (iaHabilitada) {
    const consultar = args.consultar ?? consultarGemini
    const inicio = Date.now()
    try {
      const { json, uso } = await consultar(INSTRUCAO, [textoParaIa(descricao, empresa)], SCHEMA)
      await registrarUsoDeIa({ tenderId: null, quem: args.quem, uso, durationMs: Date.now() - inicio, status: 'OK', etapa: 'perfil' })
      const sugestoes = validarSugestoes(json)
      if (sugestoes.length > 0) return { empresa, sugestoes, origem: 'ia' }
    } catch (err) {
      const uso = err instanceof ErroComUso ? err.uso : { provider: 'gemini', model: modeloDoAtendimento(), inputTokens: 0, outputTokens: 0 }
      await registrarUsoDeIa({ tenderId: null, quem: args.quem, uso, durationMs: Date.now() - inicio, status: 'ERRO', etapa: 'perfil' })
      console.error('[Perfil do negócio] IA falhou, usando as atividades do CNPJ:', err instanceof Error ? err.message : err)
    }
  }
  return { empresa, sugestoes: itensPelasAtividades(empresa?.atividades ?? []), origem: 'atividades' }
}
