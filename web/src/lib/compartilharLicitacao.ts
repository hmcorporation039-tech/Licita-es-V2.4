import { dataDaLicitacao, formatarDataDaLicitacao } from './datas'

export interface LicitacaoParaCompartilhar {
  id: string
  objeto: string
  orgao: string | null
  local: string | null
  fonte: string
  encerramentoAt: string | null
  aberturaAt: string | null
  linkEdital: string | null
}

const LIMITE_DO_OBJETO = 160
const MINUTOS_DO_EVENTO = 30

function prazoDaLicitacao(l: LicitacaoParaCompartilhar): { rotulo: string; valor: string } | null {
  if (l.encerramentoAt) return { rotulo: 'Prazo para enviar a proposta', valor: l.encerramentoAt }
  if (l.aberturaAt) return { rotulo: 'Data da sessão', valor: l.aberturaAt }
  return null
}

function resumir(texto: string, limite: number): string {
  const limpo = texto.replace(/\s+/g, ' ').trim()
  return limpo.length > limite ? `${limpo.slice(0, limite - 1).trimEnd()}…` : limpo
}

export function linkDaLicitacao(origem: string, id: string): string {
  return `${origem}/tenders/${encodeURIComponent(id)}`
}

export function textoParaWhatsApp(l: LicitacaoParaCompartilhar, origem: string): string {
  const prazo = prazoDaLicitacao(l)
  const linhas = [
    `*${resumir(l.objeto, LIMITE_DO_OBJETO)}*`,
    [l.orgao, l.local].filter(Boolean).join(' · '),
    prazo ? `${prazo.rotulo}: ${formatarDataDaLicitacao(prazo.valor, l.fonte)}` : null,
    l.linkEdital ? `Edital: ${l.linkEdital}` : null,
    `Na Licita Bela: ${linkDaLicitacao(origem, l.id)}`,
  ]
  return linhas.filter((linha): linha is string => Boolean(linha)).join('\n')
}

export function linkDoWhatsApp(texto: string): string {
  return `https://wa.me/?text=${encodeURIComponent(texto)}`
}

function escaparIcs(texto: string): string {
  return texto.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/([,;])/g, '\\$1')
}

const OCTETOS_POR_LINHA = 74
const codificador = new TextEncoder()

function dobrarLinha(linha: string): string {
  const partes: string[] = []
  let atual = ''
  let octetos = 0
  for (const caractere of linha) {
    const tamanho = codificador.encode(caractere).length
    if (octetos + tamanho > OCTETOS_POR_LINHA) {
      partes.push(atual)
      atual = ` ${caractere}`
      octetos = 1 + tamanho
    } else {
      atual += caractere
      octetos += tamanho
    }
  }
  partes.push(atual)
  return partes.join('\r\n')
}

function instanteIcs(data: Date): string {
  return data.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function diaIcs(dia: string): string {
  return dia.replace(/-/g, '')
}

function diaSeguinte(dia: string): string {
  return new Date(Date.parse(`${dia}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10)
}

export function arquivoDaAgenda(l: LicitacaoParaCompartilhar, origem: string, agora: Date = new Date()): string | null {
  const prazo = prazoDaLicitacao(l)
  if (!prazo) return null
  const quando = dataDaLicitacao(prazo.valor, l.fonte)
  if (!quando) return null
  const diaInteiro = /^\d{4}-\d{2}-\d{2}$/.test(quando)
  const inicio = diaInteiro ? null : new Date(quando)
  const descricao = [
    prazo.rotulo,
    [l.orgao, l.local].filter(Boolean).join(' · '),
    l.linkEdital ? `Edital: ${l.linkEdital}` : '',
    `Na Licita Bela: ${linkDaLicitacao(origem, l.id)}`,
  ]
    .filter(Boolean)
    .join('\n')
  const linhas = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Licita Bela//Prazos de licitação//PT-BR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:licitacao-${l.id}@licitabela.com.br`,
    `DTSTAMP:${instanteIcs(agora)}`,
    ...(diaInteiro
      ? [`DTSTART;VALUE=DATE:${diaIcs(quando)}`, `DTEND;VALUE=DATE:${diaIcs(diaSeguinte(quando))}`]
      : [`DTSTART:${instanteIcs(inicio!)}`, `DTEND:${instanteIcs(new Date(inicio!.getTime() + MINUTOS_DO_EVENTO * 60_000))}`]),
    `SUMMARY:${escaparIcs(`Prazo: ${resumir(l.objeto, 90)}`)}`,
    `DESCRIPTION:${escaparIcs(descricao)}`,
    `URL:${linkDaLicitacao(origem, l.id)}`,
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Prazo da licitação amanhã',
    'TRIGGER:-P1D',
    'END:VALARM',
    'BEGIN:VALARM',
    'ACTION:DISPLAY',
    'DESCRIPTION:Prazo da licitação em 2 horas',
    'TRIGGER:-PT2H',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]
  return linhas.map(dobrarLinha).join('\r\n') + '\r\n'
}
