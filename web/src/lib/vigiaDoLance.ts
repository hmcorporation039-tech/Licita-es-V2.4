// Vigia do lance: durante a disputa, a Bela confere a sugestão de cada item e avisa
// (som, voz e cartão na tela) quando cobriram o seu lance. Enquanto você não estiver
// na frente, ela repete o aviso a cada minuto; na fase final (tempo aleatório, que
// pode fechar a qualquer momento) repete a cada 15 segundos.
//
// A Bela nunca envia lance: ela calcula, avisa e escreve o valor no campo quando você
// pede. Quem confere e clica em enviar no portal é sempre você. Regra pura, sem tela.

export const INTERVALO_NORMAL_MS = 60_000
export const INTERVALO_FASE_FINAL_MS = 15_000
/** Mensagem de fase final mais antiga que isso não conta mais (a disputa já fechou). */
export const VALIDADE_DO_AVISO_DE_FASE_FINAL_MS = 20 * 60_000

export interface InstrucaoParaVigia {
  alvo: string
  rotulo: string
  acao: 'dar' | 'travar' | 'aguardar'
  valor: number | null
  motivo: string | null
  texto: string
}

export interface UltimoAviso {
  chave: string
  em: number
}

export type TipoDoAviso = 'cobriram' | 'lembrete' | 'travou'

export interface AvisoDaVigia {
  tipo: TipoDoAviso
  alvo: string
  chave: string
  valor: number | null
  titulo: string
  texto: string
  fala: string
}

export function chaveDaInstrucao(i: InstrucaoParaVigia): string | null {
  if (i.acao === 'dar' && i.valor !== null) return `dar:${i.valor}`
  if (i.acao === 'travar') return `travar:${i.motivo ?? i.texto}`
  return null
}

const brl = (n: number) => n.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function noItem(i: InstrucaoParaVigia, varios: boolean): string {
  return varios && i.rotulo ? ` (${i.rotulo})` : ''
}

export interface EntradaDaVigia {
  instrucoes: InstrucaoParaVigia[]
  ultimos: Record<string, UltimoAviso | undefined>
  agora: number
  faseFinal: boolean
}

/**
 * O próximo aviso a dar agora (ou null). Prioridade: lance coberto (sugestão nova) >
 * lembrete de quem continua atrás > travou (piso ou limite de lances).
 */
export function proximoAviso(e: EntradaDaVigia): AvisoDaVigia | null {
  const intervalo = e.faseFinal ? INTERVALO_FASE_FINAL_MS : INTERVALO_NORMAL_MS
  const varios = new Set(e.instrucoes.map((i) => i.alvo)).size > 1
  const pressa = e.faseFinal ? 'Fase final! ' : ''
  let lembrete: AvisoDaVigia | null = null
  let travou: AvisoDaVigia | null = null
  for (const i of e.instrucoes) {
    const chave = chaveDaInstrucao(i)
    if (!chave) continue
    const ultimo = e.ultimos[i.alvo]
    if (i.acao === 'dar' && i.valor !== null) {
      const onde = noItem(i, varios)
      if (ultimo?.chave !== chave) {
        return {
          tipo: 'cobriram',
          alvo: i.alvo,
          chave,
          valor: i.valor,
          titulo: `${pressa}Cobriram o seu lance${onde}`,
          texto: `Sugestão para voltar à frente: ${brl(i.valor)}. Escreva no portal, confira e envie.`,
          fala: `${pressa}Cobriram o seu lance${onde}. Sugiro ${brl(i.valor)}.`,
        }
      }
      if (!lembrete && e.agora - ultimo.em >= intervalo) {
        lembrete = {
          tipo: 'lembrete',
          alvo: i.alvo,
          chave,
          valor: i.valor,
          titulo: `${pressa}Você ainda não está na frente${onde}`,
          texto: `A sugestão continua ${brl(i.valor)}.${e.faseFinal ? ' A disputa pode fechar a qualquer momento.' : ''}`,
          fala: `${pressa}Você ainda não está na frente${onde}. Sugiro ${brl(i.valor)}.`,
        }
      }
    } else if (i.acao === 'travar' && ultimo?.chave !== chave && !travou) {
      travou = {
        tipo: 'travou',
        alvo: i.alvo,
        chave,
        valor: null,
        titulo: `Pare aqui${noItem(i, varios)}`,
        texto: i.motivo ?? i.texto,
        fala: `Atenção${noItem(i, varios)}: ${i.motivo ?? i.texto}`,
      }
    }
  }
  return lembrete ?? travou
}

/** Esquece o aviso de quem voltou à frente: se cobrirem de novo, avisa na hora. */
export function limparQuemEstaNaFrente(instrucoes: InstrucaoParaVigia[], ultimos: Record<string, UltimoAviso | undefined>): Record<string, UltimoAviso | undefined> {
  const novos = { ...ultimos }
  for (const i of instrucoes) if (i.acao === 'aguardar') delete novos[i.alvo]
  return novos
}

function normalizar(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

// Aviso do portal ou do pregoeiro de que a etapa de lances vai fechar: iminência de
// encerramento, tempo aleatório (randômico), prorrogação automática ou lance final.
const FASE_FINAL = /\b(iminencia|tempo aleatorio|aleatoriamente|randomic\w*|prorrogacao automatica|encerramento (da etapa|dos lances|iminente)|etapa de lances (sera|vai ser) encerrada|lance final|fase fechada|fechamento iminente)\b/

export function ehAvisoDeFaseFinal(texto: string): boolean {
  return FASE_FINAL.test(normalizar(texto))
}

export interface MensagemParaVigia {
  texto: string
  createdAt: string
}

export function faseFinalPeloChat(mensagens: MensagemParaVigia[], agora: number): boolean {
  return mensagens.some((m) => {
    const em = Date.parse(m.createdAt)
    return Number.isFinite(em) && agora - em <= VALIDADE_DO_AVISO_DE_FASE_FINAL_MS && ehAvisoDeFaseFinal(m.texto)
  })
}
