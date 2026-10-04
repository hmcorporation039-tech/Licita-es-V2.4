// ============================================================
// lib/radar.ts — Regras puras do Radar de oportunidades (Fase 3), sobre os
// contratos públicos do PNCP: contratos que estão para vencer (oportunidade de
// disputar a renovação/nova licitação) e dossiê de um concorrente.
// Sem rede e sem banco: quem busca é services/pncpConsultaService.ts.
// ============================================================

export interface ContratoPncp {
  id: string
  orgao: { cnpj: string; nome: string; uf: string | null; municipio: string | null }
  fornecedor: { ni: string; nome: string }
  objeto: string
  valorGlobal: number
  assinatura: string | null
  vigenciaInicio: string | null
  vigenciaFim: string | null
  categoria: string | null
  tipo: string | null
}

type Bruto = Record<string, unknown>
const txt = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const obj = (v: unknown): Bruto => (v && typeof v === 'object' ? (v as Bruto) : {})
const dia = (v: unknown): string | null => {
  const s = txt(v).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

export function normalizarContrato(bruto: unknown): ContratoPncp | null {
  const c = obj(bruto)
  const id = txt(c.numeroControlePNCP)
  if (!id) return null
  const org = obj(c.orgaoEntidade)
  const uni = obj(c.unidadeOrgao)
  const valor = Number(c.valorGlobal)
  return {
    id,
    orgao: {
      cnpj: txt(org.cnpj),
      nome: txt(org.razaoSocial),
      uf: txt(uni.ufSigla) || null,
      municipio: txt(uni.municipioNome) || null,
    },
    fornecedor: { ni: txt(c.niFornecedor), nome: txt(c.nomeRazaoSocialFornecedor) },
    objeto: txt(c.objetoContrato),
    valorGlobal: Number.isFinite(valor) ? valor : 0,
    assinatura: dia(c.dataAssinatura),
    vigenciaInicio: dia(c.dataVigenciaInicio),
    vigenciaFim: dia(c.dataVigenciaFim),
    categoria: txt(obj(c.categoriaProcesso).nome) || null,
    tipo: txt(obj(c.tipoContrato).nome) || null,
  }
}

function semAcento(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function objetoCasaComTermos(objeto: string, termos: string[]): boolean {
  const alvo = semAcento(objeto)
  return termos.some((t) => {
    const n = semAcento(t).trim()
    return n.length >= 3 && alvo.includes(n)
  })
}

export function diasEntre(deISO: string, ateISO: string): number {
  return Math.round((Date.parse(ateISO + 'T00:00:00Z') - Date.parse(deISO + 'T00:00:00Z')) / 86_400_000)
}

export interface ContratoVencendo extends ContratoPncp {
  diasRestantes: number
  // Casou com palavras-chave dos itens monitorados da empresa.
  noSeuRamo: boolean
}

// Contratos cuja vigência termina entre hoje e hoje+dias, do mais próximo ao mais distante.
// `hoje` em AAAA-MM-DD. Repetidos (o mesmo contrato em duas janelas de busca) são unificados.
export function contratosVencendo(contratos: ContratoPncp[], hoje: string, dias: number, termos: string[] = []): ContratoVencendo[] {
  const vistos = new Set<string>()
  const saida: ContratoVencendo[] = []
  for (const c of contratos) {
    if (!c.vigenciaFim || vistos.has(c.id)) continue
    const restantes = diasEntre(hoje, c.vigenciaFim)
    if (restantes < 0 || restantes > dias) continue
    vistos.add(c.id)
    saida.push({ ...c, diasRestantes: restantes, noSeuRamo: termos.length > 0 && objetoCasaComTermos(c.objeto, termos) })
  }
  return saida.sort((a, b) => a.diasRestantes - b.diasRestantes || b.valorGlobal - a.valorGlobal)
}

export interface DossieDoConcorrente {
  fornecedor: { ni: string; nome: string } | null
  totalDeContratos: number
  valorTotal: number
  primeiraAssinatura: string | null
  ultimaAssinatura: string | null
  porOrgao: { cnpj: string; nome: string; contratos: number; valor: number }[]
  porUf: { uf: string; contratos: number; valor: number }[]
  porCategoria: { categoria: string; contratos: number; valor: number }[]
  ultimosContratos: ContratoPncp[]
  vencendoEm90Dias: ContratoVencendo[]
}

function agrupar<T>(itens: T[], chave: (t: T) => string, valor: (t: T) => number) {
  const mapa = new Map<string, { contratos: number; valor: number }>()
  for (const i of itens) {
    const k = chave(i)
    const atual = mapa.get(k) ?? { contratos: 0, valor: 0 }
    atual.contratos += 1
    atual.valor += valor(i)
    mapa.set(k, atual)
  }
  return [...mapa.entries()].map(([k, v]) => ({ k, ...v })).sort((a, b) => b.valor - a.valor)
}

export function montarDossie(contratos: ContratoPncp[], hoje: string): DossieDoConcorrente {
  const unicos = [...new Map(contratos.map((c) => [c.id, c])).values()]
  const assinaturas = unicos.map((c) => c.assinatura).filter((d): d is string => !!d).sort()
  const porOrgao = agrupar(unicos, (c) => c.orgao.cnpj + '|' + c.orgao.nome, (c) => c.valorGlobal)
  return {
    fornecedor: unicos[0] ? unicos[0].fornecedor : null,
    totalDeContratos: unicos.length,
    valorTotal: unicos.reduce((s, c) => s + c.valorGlobal, 0),
    primeiraAssinatura: assinaturas[0] ?? null,
    ultimaAssinatura: assinaturas[assinaturas.length - 1] ?? null,
    porOrgao: porOrgao.slice(0, 10).map(({ k, contratos: n, valor }) => {
      const [cnpj, ...nome] = k.split('|')
      return { cnpj, nome: nome.join('|'), contratos: n, valor }
    }),
    porUf: agrupar(unicos, (c) => c.orgao.uf ?? '—', (c) => c.valorGlobal).map(({ k, contratos: n, valor }) => ({ uf: k, contratos: n, valor })),
    porCategoria: agrupar(unicos, (c) => c.categoria ?? 'Não informada', (c) => c.valorGlobal).map(({ k, contratos: n, valor }) => ({
      categoria: k,
      contratos: n,
      valor,
    })),
    ultimosContratos: [...unicos].sort((a, b) => (b.assinatura ?? '').localeCompare(a.assinatura ?? '')).slice(0, 10),
    vencendoEm90Dias: contratosVencendo(unicos, hoje, 90),
  }
}

// Janelas de até 364 dias (o PNCP recusa períodos maiores que 365), da mais recente para a mais antiga.
export function janelasDeBusca(hoje: string, quantidade: number): { inicial: string; final: string }[] {
  const fmt = (d: Date) => d.toISOString().slice(0, 10).replace(/-/g, '')
  const fim0 = new Date(hoje + 'T00:00:00Z')
  const saida: { inicial: string; final: string }[] = []
  for (let i = 0; i < quantidade; i++) {
    const fim = new Date(fim0.getTime() - i * 365 * 86_400_000)
    const ini = new Date(fim.getTime() - 364 * 86_400_000)
    saida.push({ inicial: fmt(ini), final: fmt(fim) })
  }
  return saida
}

export function cnpjValido14(v: string): boolean {
  return /^\d{14}$/.test(v.replace(/\D/g, ''))
}
