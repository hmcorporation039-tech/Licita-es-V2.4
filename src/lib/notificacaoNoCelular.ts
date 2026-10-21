import { quantidadeCom } from './plural'
import { textoDoTempoRestante } from './prazoDoAviso'

export const TIPOS_DE_AVISO_NO_CELULAR = ['novas-licitacoes', 'lembrete-de-prazo', 'aviso-de-alteracao'] as const
export type TipoDeAvisoNoCelular = (typeof TIPOS_DE_AVISO_NO_CELULAR)[number]

export type CampoDoAvisoNoCelular = 'celularNovasLicitacoes' | 'celularLembreteDePrazo' | 'celularAvisoDeAlteracao'

export const CAMPO_DO_AVISO_NO_CELULAR: Record<TipoDeAvisoNoCelular, CampoDoAvisoNoCelular> = {
  'novas-licitacoes': 'celularNovasLicitacoes',
  'lembrete-de-prazo': 'celularLembreteDePrazo',
  'aviso-de-alteracao': 'celularAvisoDeAlteracao',
}

export interface MensagemNoCelular {
  titulo: string
  corpo: string
  url: string
  tag: string
}

export interface LicitacaoDoAvisoNoCelular {
  tenderId: string
  objeto: string
  orgao: string | null
  uf: string | null
}

export interface LicitacaoComPrazo {
  tenderId: string
  objeto: string
  fimDoPrazo: Date
}

const TAMANHO_MAXIMO_DO_CORPO = 180
const SERVICOS_DE_ENTREGA_EXATOS = ['fcm.googleapis.com', 'web.push.apple.com']
const SERVICOS_DE_ENTREGA_POR_SUFIXO = ['.push.services.mozilla.com', '.notify.windows.com', '.push.apple.com']

export function encurtar(texto: string, limite: number = TAMANHO_MAXIMO_DO_CORPO): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length <= limite ? limpo : `${limpo.slice(0, limite - 1).trimEnd()}…`
}

export function enderecoDeEntregaAceito(endpoint: string): boolean {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    return false
  }
  if (url.protocol !== 'https:' || url.port !== '' || url.username !== '' || url.password !== '') return false
  const host = url.hostname.toLowerCase()
  return SERVICOS_DE_ENTREGA_EXATOS.includes(host) || SERVICOS_DE_ENTREGA_POR_SUFIXO.some((sufixo) => host.endsWith(sufixo))
}

function ondeFica(licitacao: LicitacaoDoAvisoNoCelular): string {
  if (!licitacao.orgao) return ''
  return licitacao.uf ? ` · ${licitacao.orgao}/${licitacao.uf}` : ` · ${licitacao.orgao}`
}

function eMaisOutras(primeiro: string, total: number): string {
  return encurtar(`${primeiro} e mais ${quantidadeCom(total - 1, 'licitação', 'licitações')}`)
}

function comMaiuscula(texto: string): string {
  return texto.charAt(0).toUpperCase() + texto.slice(1)
}

export function mensagemDeNovasLicitacoes(licitacoes: LicitacaoDoAvisoNoCelular[]): MensagemNoCelular {
  const [primeira] = licitacoes
  if (licitacoes.length === 1) {
    return { titulo: 'Licitação nova para você', corpo: encurtar(`${primeira.objeto}${ondeFica(primeira)}`), url: `/tenders/${primeira.tenderId}`, tag: 'novas-licitacoes' }
  }
  return {
    titulo: `${quantidadeCom(licitacoes.length, 'licitação nova', 'licitações novas')} para você`,
    corpo: eMaisOutras(primeira.objeto, licitacoes.length),
    url: '/matches',
    tag: 'novas-licitacoes',
  }
}

export function mensagemDoLembreteDePrazo(licitacoes: LicitacaoComPrazo[], agora: Date): MensagemNoCelular {
  const ordenadas = [...licitacoes].sort((a, b) => a.fimDoPrazo.getTime() - b.fimDoPrazo.getTime())
  const [primeira] = ordenadas
  if (ordenadas.length === 1) {
    return {
      titulo: `${comMaiuscula(textoDoTempoRestante(primeira.fimDoPrazo, agora))} para o fim do prazo`,
      corpo: encurtar(primeira.objeto),
      url: `/tenders/${primeira.tenderId}`,
      tag: `prazo-${primeira.tenderId}`,
    }
  }
  return {
    titulo: `${quantidadeCom(ordenadas.length, 'licitação', 'licitações')} com prazo perto do fim`,
    corpo: eMaisOutras(primeira.objeto, ordenadas.length),
    url: '/escolhidas',
    tag: 'prazo',
  }
}

export function mensagemDeAlteracao(tenderId: string, objeto: string, rotulosDosCampos: string[]): MensagemNoCelular {
  const oQueMudou = rotulosDosCampos.length > 0 ? `${rotulosDosCampos.join(', ')}: ` : ''
  return { titulo: 'Licitação alterada pelo órgão', corpo: encurtar(`${oQueMudou}${objeto}`), url: `/tenders/${tenderId}`, tag: `alteracao-${tenderId}` }
}

export const MENSAGEM_DE_TESTE: MensagemNoCelular = {
  titulo: 'Notificações ativadas',
  corpo: 'É assim que a Licita Bela vai avisar você sobre licitações novas e prazos.',
  url: '/dashboard',
  tag: 'teste',
}


const SISTEMAS: [RegExp, string][] = [
  [/iPhone/i, 'iPhone'],
  [/iPad/i, 'iPad'],
  [/Android/i, 'Android'],
  [/Windows/i, 'Windows'],
  [/Macintosh|Mac OS X/i, 'Mac'],
  [/CrOS/i, 'Chromebook'],
  [/Linux/i, 'Linux'],
]

const NAVEGADORES: [RegExp, string][] = [
  [/SamsungBrowser/i, 'Samsung Internet'],
  [/Edg(A|iOS)?\//i, 'Edge'],
  [/OPR\/|Opera/i, 'Opera'],
  [/Firefox|FxiOS/i, 'Firefox'],
  [/Chrome|CriOS/i, 'Chrome'],
  [/Safari/i, 'Safari'],
]

export function descreverAparelho(userAgent: string | undefined): string | null {
  if (!userAgent) return null
  const sistema = SISTEMAS.find(([padrao]) => padrao.test(userAgent))?.[1]
  const navegador = NAVEGADORES.find(([padrao]) => padrao.test(userAgent))?.[1]
  const partes = [sistema, navegador].filter((parte): parte is string => Boolean(parte))
  return partes.length > 0 ? partes.join(' · ') : null
}
