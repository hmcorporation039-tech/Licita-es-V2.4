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

const VOZES_FEMININAS = /francisca|thalita|maria|luciana|fernanda|vit[oó]ria|leila|yara|manuela|camila|brenda|elza|giovanna|let[ií]cia|raquel|helo[ií]sa|google portugu[eê]s do brasil|female|feminin|mulher/i
const VOZES_MASCULINAS = /daniel|ant[oô]nio|felipe|f[aá]bio|donato|j[uú]lio|humberto|nicolau|val[eé]rio|ricardo|\bmale\b|masculin/i
const VOZES_NATURAIS = /natural|online|neural|premium|enhanced/i

const ehPortuguesDoBrasil = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().replace('_', '-').startsWith('pt-br')
const ehPortugues = (v: SpeechSynthesisVoice) => v.lang.toLowerCase().startsWith('pt')
const ehFeminina = (v: SpeechSynthesisVoice) => VOZES_FEMININAS.test(v.name)
const ehMasculina = (v: SpeechSynthesisVoice) => !ehFeminina(v) && VOZES_MASCULINAS.test(v.name)

function pontuacaoDaVoz(v: SpeechSynthesisVoice): number {
  return (ehPortuguesDoBrasil(v) ? 8 : 0) + (ehFeminina(v) ? 16 : 0) + (ehMasculina(v) ? -32 : 0) + (VOZES_NATURAIS.test(v.name) ? 2 : 0) + (v.localService ? 1 : 0)
}

export function vozDaBela(vozes: SpeechSynthesisVoice[]): SpeechSynthesisVoice | null {
  const emPortugues = vozes.filter(ehPortugues)
  if (emPortugues.length === 0) return null
  return [...emPortugues].sort((a, b) => pontuacaoDaVoz(b) - pontuacaoDaVoz(a))[0]
}

function vozesCarregadas(): Promise<SpeechSynthesisVoice[]> {
  const sintese = window.speechSynthesis
  const ja = sintese.getVoices()
  if (ja.length > 0) return Promise.resolve(ja)
  return new Promise((resolve) => {
    const desistir = window.setTimeout(() => resolve(sintese.getVoices()), 1200)
    sintese.addEventListener(
      'voiceschanged',
      () => {
        window.clearTimeout(desistir)
        resolve(sintese.getVoices())
      },
      { once: true },
    )
  })
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
    void vozesCarregadas()
      .then((vozes) => {
        const fala = new SpeechSynthesisUtterance(texto)
        fala.lang = 'pt-BR'
        const voz = vozDaBela(vozes)
        if (voz) {
          fala.voice = voz
          if (ehMasculina(voz)) fala.pitch = 1.3
        }
        sintese.speak(fala)
      })
      .catch(() => {})
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
