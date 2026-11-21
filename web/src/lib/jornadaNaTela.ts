// O que a Bela fala em cada fase do passo a passo guiado (a regra das fases fica
// em src/lib/jornadaDaBela.ts, no servidor). Puro, sem tela.

export type FaseDaJornada = 'convite' | 'adiada' | 'recusada' | 'oQueVende' | 'onde' | 'buscando' | 'resultado' | 'etapa1Feita'

export interface EstadoDaJornada {
  fase: FaseDaJornada
  termo?: string
  ufs?: string[]
  atualizadoEm: string
  adiadaAte?: string
}

export interface ItemDaJornada {
  id: string
  name: string
  keywords: string[]
  ufs: string[]
}

export interface RespostaDaJornada {
  oferecer: boolean
  estado: EstadoDaJornada | null
  nome: string | null
  ufDaEmpresa: string | null
  itens: ItemDaJornada[]
  matches: number
  buscando: boolean
}

export const FASES_EM_ANDAMENTO: FaseDaJornada[] = ['oQueVende', 'onde', 'buscando', 'resultado']

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO']

const numero = (n: number) => n.toLocaleString('pt-BR')

export function primeiroNome(nome: string | null): string | null {
  const primeiro = nome?.trim().split(/\s+/)[0]
  return primeiro ? primeiro.charAt(0).toLocaleUpperCase('pt-BR') + primeiro.slice(1) : null
}

export function nomeDoItem(termo: string): string {
  const t = termo.trim().replace(/\s+/g, ' ')
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1)
}

/** Texto curto dos estados escolhidos: "em todo o Brasil", "no DF", "em GO e DF", "em 5 estados". */
export function ondeEmTexto(ufs: string[]): string {
  if (ufs.length === 0 || ufs.length === UFS.length) return 'em todo o Brasil'
  if (ufs.length === 1) return `em ${ufs[0]}`
  if (ufs.length <= 3) return `em ${ufs.slice(0, -1).join(', ')} e ${ufs[ufs.length - 1]}`
  return `em ${ufs.length} estados`
}

export function mesmosEstados(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false
  const s = new Set(a)
  return b.every((x) => s.has(x))
}

/** As licitações abertas daquele termo, para quando ainda não há match. */
export function linkDasAbertas(termo: string, ufs: string[]): string {
  const qs = new URLSearchParams({ q: termo.trim(), situacao: 'ABERTA', relacionadas: '0' })
  if (ufs.length > 0 && ufs.length < UFS.length) qs.set('uf', ufs.join(','))
  return `/tenders?${qs.toString()}`
}

export function falaDoConvite(nome: string | null): string {
  const quem = primeiroNome(nome)
  return `Oi${quem ? `, ${quem}` : ''}! Eu sou a Bela. Quer que eu te leve, passo a passo, até a sua primeira licitação? Leva uns 10 minutos.`
}

export function falaDoQueVende(itemDoCadastro: ItemDaJornada | null): string {
  if (itemDoCadastro) return `Quando você se cadastrou, me disse que vende "${itemDoCadastro.name}". É isso mesmo, ou quer me dizer de outro jeito?`
  return 'Primeiro me conta: o que a sua empresa vende? Pode falar ou escrever, do seu jeito.'
}

export function falaDoOnde(termo: string): string {
  return `Certo: ${termo.toLocaleLowerCase('pt-BR')}. Em quais estados você quer vender? Marque um ou mais. Se não souber, deixe "Brasil todo".`
}

export function falaDaBusca(termo: string, ufs: string[]): string {
  return `Estou procurando licitações de ${termo.toLocaleLowerCase('pt-BR')} ${ondeEmTexto(ufs)}. Só um instante.`
}

export function falaDoResultado(termo: string, ufs: string[], matches: number): string {
  if (matches === 0) {
    return `Ainda não achei licitação aberta de ${termo.toLocaleLowerCase('pt-BR')} ${ondeEmTexto(ufs)}. Eu procuro todos os dias e te aviso por e-mail quando aparecer. Enquanto isso, quer ver as licitações abertas parecidas?`
  }
  return `Achei ${numero(matches)} ${matches === 1 ? 'licitação' : 'licitações'} para você! Vou te mostrar onde elas ficam.`
}

export const FALA_NOS_MATCHES =
  'Aqui ficam as licitações que combinam com o que você vende. Toque em uma para abrir: lá dentro eu mostro o resumo do edital, os documentos que pedem e os prazos.'

export const FALA_FINAL =
  'Pronto! A partir de agora eu procuro todo dia para você. Quando quiser falar comigo, é só tocar em "Bela" lá em cima.'
