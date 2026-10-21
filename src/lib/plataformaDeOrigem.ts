export const MAXIMO_DE_PRINCIPAIS_PLATAFORMAS = 12

const APELIDOS_DAS_PLATAFORMAS: Record<string, string> = {
  'bolsa nacional de compras - bnc': 'BNC',
  'licitar digital - plataforma de licitacoes online': 'Licitar Digital',
  'licitacon - tce-rs': 'LicitaCon (TCE-RS)',
  'bll compras': 'BLL',
  'ecustomize consultoria em software s.a': 'Portal de Compras Públicas',
  'licitanet licitacoes eletronicas ltda': 'Licitanet',
  'novo bbmnet licitacoes': 'BBMNET',
  'portal de compras do estado de minas gerais': 'Compras MG',
  'portal de compras publicas do estado do rio de janeiro': 'Compras RJ',
  'procergs - centro de tecnologia da informacao e comunicacao do estado do rio grande do sul s.a.': 'Compras RS',
  'secretaria de administracao do estado de pernambuco': 'PE-Integrado',
  'central de compras da paraiba/pb': 'Central de Compras PB',
  'centro de servicos compartilhados': 'e-Compras AM',
  'elotech gestao publica ltda': 'Elotech',
  'equiplano sistemas ltda / equiplano sistemas': 'Equiplano',
  'ipm sistemas': 'IPM Sistemas',
  'betha sistemas': 'Betha Sistemas',
}

const COMECO_DE_NOME_DE_ORGAO = /^(prefeitura|municipio|camara|tribunal|ministerio publico|assembleia legislativa|consorcio)\b/

function semAcentoEmMinusculas(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function normalizarPlataformaDeOrigem(nome: unknown): string | undefined {
  if (typeof nome !== 'string') return undefined
  const limpo = nome.replace(/\s+/g, ' ').trim()
  return limpo.length > 0 ? limpo : undefined
}

export function apelidoDaPlataforma(nome: string): string {
  const limpo = normalizarPlataformaDeOrigem(nome) ?? ''
  return APELIDOS_DAS_PLATAFORMAS[semAcentoEmMinusculas(limpo)] ?? limpo
}

export function ehOProprioOrgaoPublicando(nome: string): boolean {
  return COMECO_DE_NOME_DE_ORGAO.test(semAcentoEmMinusculas(normalizarPlataformaDeOrigem(nome) ?? ''))
}

export interface ResumoDasPlataformas {
  plataformas: number
  principaisPlataformas: string[]
}

export function resumirPlataformas(grupos: { nome: string | null; licitacoes: number }[]): ResumoDasPlataformas {
  const porApelido = new Map<string, number>()
  for (const { nome, licitacoes } of grupos) {
    if (!nome || licitacoes <= 0 || ehOProprioOrgaoPublicando(nome)) continue
    const apelido = apelidoDaPlataforma(nome)
    if (!apelido) continue
    porApelido.set(apelido, (porApelido.get(apelido) ?? 0) + licitacoes)
  }
  const ordenadas = [...porApelido.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))
  return {
    plataformas: ordenadas.length,
    principaisPlataformas: ordenadas.slice(0, MAXIMO_DE_PRINCIPAIS_PLATAFORMAS).map(([apelido]) => apelido),
  }
}
