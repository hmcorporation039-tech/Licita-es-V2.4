interface AlternativaReconhecida {
  readonly transcript: string
}

interface ResultadoReconhecido {
  readonly isFinal: boolean
  readonly length: number
  readonly [indice: number]: AlternativaReconhecida
}

interface ListaDeResultados {
  readonly length: number
  readonly [indice: number]: ResultadoReconhecido
}

interface EventoDeResultado {
  readonly results: ListaDeResultados
}

interface EventoDeErro {
  readonly error: string
}

interface Reconhecedor {
  lang: string
  interimResults: boolean
  continuous: boolean
  maxAlternatives: number
  onresult: ((evento: EventoDeResultado) => void) | null
  onerror: ((evento: EventoDeErro) => void) | null
  onend: (() => void) | null
  start(): void
  stop(): void
  abort(): void
}

type ConstrutorDeReconhecedor = new () => Reconhecedor

type JanelaComVoz = Window & {
  SpeechRecognition?: ConstrutorDeReconhecedor
  webkitSpeechRecognition?: ConstrutorDeReconhecedor
}

export interface EscutaEmAndamento {
  promessa: Promise<string>
  parar: () => void
  cancelar: () => void
}

const MENSAGENS_DE_ERRO: Record<string, string> = {
  'not-allowed': 'O microfone está bloqueado. Libere o acesso no cadeado da barra de endereço do navegador ou digite o pedido.',
  'service-not-allowed': 'O navegador não permitiu usar o reconhecimento de voz. Digite o pedido.',
  'no-speech': 'Não ouvi nada. Toque no microfone e fale de novo, ou digite o pedido.',
  network: 'O reconhecimento de voz precisa de internet e não conseguiu se conectar. Tente de novo ou digite o pedido.',
  'audio-capture': 'Nenhum microfone encontrado neste aparelho. Digite o pedido.',
}

const ERRO_GENERICO = 'Não consegui entender o áudio. Tente de novo ou digite o pedido.'
const CHAVE_DA_FALA = 'licitacao-platform:bela-fala'

function construtorDoReconhecedor(): ConstrutorDeReconhecedor | null {
  if (typeof window === 'undefined') return null
  const janela = window as JanelaComVoz
  return janela.SpeechRecognition ?? janela.webkitSpeechRecognition ?? null
}

export function vozDisponivel(): boolean {
  return construtorDoReconhecedor() !== null
}

export function ouvir({ onParcial }: { onParcial?: (texto: string) => void } = {}): EscutaEmAndamento {
  const Construtor = construtorDoReconhecedor()
  if (!Construtor) {
    return { promessa: Promise.reject(new Error('Este navegador não reconhece voz. Digite o pedido.')), parar: () => {}, cancelar: () => {} }
  }

  const reconhecedor = new Construtor()
  reconhecedor.lang = 'pt-BR'
  reconhecedor.interimResults = true
  reconhecedor.continuous = false
  reconhecedor.maxAlternatives = 1

  let textoFinal = ''
  let textoParcial = ''
  let codigoDoErro: string | null = null
  let cancelada = false

  const promessa = new Promise<string>((resolve, reject) => {
    reconhecedor.onresult = (evento) => {
      let finais = ''
      let parciais = ''
      for (let i = 0; i < evento.results.length; i++) {
        const resultado = evento.results[i]
        const transcricao = resultado[0]?.transcript ?? ''
        if (resultado.isFinal) finais += transcricao
        else parciais += transcricao
      }
      textoFinal = finais
      textoParcial = parciais
      onParcial?.(`${finais} ${parciais}`.replace(/\s+/g, ' ').trim())
    }
    reconhecedor.onerror = (evento) => {
      codigoDoErro = evento.error
    }
    reconhecedor.onend = () => {
      const texto = (textoFinal || textoParcial).replace(/\s+/g, ' ').trim()
      if (cancelada || codigoDoErro === 'aborted') return resolve('')
      if (texto) return resolve(texto)
      reject(new Error(MENSAGENS_DE_ERRO[codigoDoErro ?? 'no-speech'] ?? ERRO_GENERICO))
    }
    try {
      reconhecedor.start()
    } catch {
      reject(new Error('Não consegui ligar o microfone. Tente de novo ou digite o pedido.'))
    }
  })

  return {
    promessa,
    parar: () => {
      try {
        reconhecedor.stop()
      } catch {}
    },
    cancelar: () => {
      cancelada = true
      try {
        reconhecedor.abort()
      } catch {}
    },
  }
}

export function falaDisponivel(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window && typeof window.SpeechSynthesisUtterance === 'function'
}

function vozEmPortugues(): SpeechSynthesisVoice | null {
  const vozes = window.speechSynthesis.getVoices()
  return vozes.find((v) => v.lang === 'pt-BR') ?? vozes.find((v) => v.lang.toLowerCase().replace('_', '-').startsWith('pt-br')) ?? vozes.find((v) => v.lang.toLowerCase().startsWith('pt')) ?? null
}

export function calar(): void {
  if (!falaDisponivel()) return
  try {
    window.speechSynthesis.cancel()
  } catch {}
}

export function falar(texto: string): void {
  if (!falaDisponivel() || !texto.trim()) return
  try {
    const sintese = window.speechSynthesis
    sintese.cancel()
    const fala = new SpeechSynthesisUtterance(texto)
    fala.lang = 'pt-BR'
    const voz = vozEmPortugues()
    if (voz) fala.voice = voz
    sintese.speak(fala)
  } catch {}
}

export function belaFalaAsRespostas(): boolean {
  try {
    return window.localStorage.getItem(CHAVE_DA_FALA) !== 'nao'
  } catch {
    return true
  }
}

export function definirBelaFalaAsRespostas(ligada: boolean): void {
  try {
    window.localStorage.setItem(CHAVE_DA_FALA, ligada ? 'sim' : 'nao')
  } catch {}
}
