export type FaseDoItem =
  | 'aguardando'
  | 'em_disputa'
  | 'prorrogacao'
  | 'aguardando_reinicio'
  | 'encerrado'
  | 'deserto'
  | 'fracassado'
  | 'cancelado'
  | 'desconhecido'

export interface DefinicaoDeFase {
  fase: FaseDoItem
  aceitaLance: boolean
  rotulos: string[]
}

export const FASES_DO_ITEM: DefinicaoDeFase[] = [
  { fase: 'prorrogacao', aceitaLance: true, rotulos: ['Etapa aberta prorrogação', 'Prorrogação'] },
  { fase: 'em_disputa', aceitaLance: true, rotulos: ['Em disputa', 'Etapa aberta'] },
  { fase: 'aguardando_reinicio', aceitaLance: false, rotulos: ['Aguardando decisão sobre Reinício'] },
  { fase: 'aguardando', aceitaLance: false, rotulos: ['Aguardando disputa', 'Aguardando abertura'] },
  { fase: 'encerrado', aceitaLance: false, rotulos: ['Encerrado', 'Encerrada', 'Encerrados'] },
  { fase: 'deserto', aceitaLance: false, rotulos: ['Deserto'] },
  { fase: 'fracassado', aceitaLance: false, rotulos: ['Fracassado'] },
  { fase: 'cancelado', aceitaLance: false, rotulos: ['Cancelado'] },
]

export type ModoDeDisputa = 'ABERTO' | 'ABERTO_FECHADO' | 'FECHADO_ABERTO'

export interface RegraDoModo {
  modo: ModoDeDisputa
  nome: string
  duracaoInicialMin: number | null
  prorrogacaoMin: number | null
  temIminencia: boolean
  descricao: string
}

export const MODOS_DE_DISPUTA: Record<ModoDeDisputa, RegraDoModo> = {
  ABERTO: {
    modo: 'ABERTO',
    nome: 'Aberto',
    duracaoInicialMin: 10,
    prorrogacaoMin: 2,
    temIminencia: false,
    descricao:
      'Lances públicos e sucessivos por 10 minutos; o sistema prorroga 2 minutos sempre que houver lance nos 2 minutos finais.',
  },
  ABERTO_FECHADO: {
    modo: 'ABERTO_FECHADO',
    nome: 'Aberto e fechado',
    duracaoInicialMin: 15,
    prorrogacaoMin: null,
    temIminencia: true,
    descricao:
      'Etapa aberta de 15 minutos, aviso de iminência e encerramento; depois lance final fechado (sigiloso) do 1º colocado e dos que ficaram até 10% acima.',
  },
  FECHADO_ABERTO: {
    modo: 'FECHADO_ABERTO',
    nome: 'Fechado e aberto',
    duracaoInicialMin: null,
    prorrogacaoMin: 2,
    temIminencia: false,
    descricao: 'Propostas fechadas e, em seguida, etapa aberta de lances entre os classificados.',
  },
}

function normalizar(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

export function classificarFase(rotulo: string): FaseDoItem {
  const alvo = normalizar(rotulo)
  if (!alvo) return 'desconhecido'
  for (const definicao of FASES_DO_ITEM) {
    if (definicao.rotulos.some((r) => alvo.includes(normalizar(r)))) return definicao.fase
  }
  return 'desconhecido'
}

export function aceitaLance(fase: FaseDoItem): boolean {
  return FASES_DO_ITEM.find((f) => f.fase === fase)?.aceitaLance ?? false
}

export function modoPorNome(nome: string): ModoDeDisputa | null {
  const alvo = normalizar(nome)
  for (const regra of Object.values(MODOS_DE_DISPUTA)) {
    if (normalizar(regra.nome) === alvo || normalizar(regra.modo) === alvo) return regra.modo
  }
  if (alvo.includes('aberto') && alvo.includes('fechado')) {
    return alvo.indexOf('fechado') < alvo.indexOf('aberto') ? 'FECHADO_ABERTO' : 'ABERTO_FECHADO'
  }
  if (alvo.includes('aberto')) return 'ABERTO'
  return null
}
