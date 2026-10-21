export const CODIGO_CONFIRMACAO_RECENTE = 'SEGUNDO_FATOR_RECENTE'
export const CODIGO_SEGUNDO_FATOR_PENDENTE = 'SEGUNDO_FATOR_PENDENTE'

export interface SituacaoDoSegundoFator {
  disponivel: boolean
  ativo: boolean
  ativadoEm: string | null
  codigosDeRecuperacaoRestantes: number
}

export interface AplicativoParaLer {
  segredo: string
  endereco: string
  qrCodeSvg: string
}

type ConfirmarSegundoFator = () => Promise<boolean>

let confirmarAgora: ConfirmarSegundoFator | null = null

export function registrarConfirmacaoDoSegundoFator(confirmar: ConfirmarSegundoFator): () => void {
  confirmarAgora = confirmar
  return () => {
    if (confirmarAgora === confirmar) confirmarAgora = null
  }
}

export async function confirmarSegundoFator(): Promise<boolean> {
  return confirmarAgora ? confirmarAgora() : false
}

const CHAVE_DO_AVISO_DE_RECUPERACAO = 'licitacao-platform:codigos-de-recuperacao-restantes'

export function guardarAvisoDeRecuperacao(restantes: number) {
  try {
    window.sessionStorage.setItem(CHAVE_DO_AVISO_DE_RECUPERACAO, String(restantes))
  } catch {}
}

export function lerAvisoDeRecuperacao(): number | null {
  try {
    const valor = window.sessionStorage.getItem(CHAVE_DO_AVISO_DE_RECUPERACAO)
    return valor === null ? null : Number(valor)
  } catch {
    return null
  }
}

export function esquecerAvisoDeRecuperacao() {
  try {
    window.sessionStorage.removeItem(CHAVE_DO_AVISO_DE_RECUPERACAO)
  } catch {}
}

export function imagemDoQrCode(svg: string): string {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`
}
