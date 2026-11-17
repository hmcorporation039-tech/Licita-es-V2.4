// ============================================================
// lib/medicao.ts — Google Analytics (GA4) com consentimento (LGPD).
//
// Nada do Google carrega antes de a pessoa aceitar no aviso. A escolha fica no
// armazenamento local do navegador; quem recusa não recebe cookie nem script do Google.
// O ID de medição (G-...) é público por natureza: ele aparece no código de qualquer site.
// NEXT_PUBLIC_GA_ID troca o ID; NEXT_PUBLIC_GA_ID=desligado desliga a medição.
// ============================================================

const ID_PADRAO = 'G-ZJQHVTXD35'
const CHAVE = 'licita-bela:medicao'
export const EVENTO_REABRIR = 'bela:medicao-reabrir'

// Conversão de cadastro no Google Ads: "AW-123456789/AbCdEf". Também é público (vai no código do site).
// Vazio = Google Ads desligado (só o GA4 funciona).
const CONVERSAO_PADRAO = ''
export const VALOR_DO_CADASTRO_EM_REAIS = 30

export interface ConversaoDoAds {
  conta: string
  enviarPara: string
}

export function conversaoDoAds(valor: string | undefined = process.env.NEXT_PUBLIC_GOOGLE_ADS_CONVERSAO): ConversaoDoAds | null {
  const texto = (valor ?? '').trim() || CONVERSAO_PADRAO
  const partes = /^(AW-\d{6,15})\/([A-Za-z0-9_-]{4,64})$/.exec(texto)
  return partes ? { conta: partes[1], enviarPara: texto } : null
}

export type EscolhaDeMedicao = 'aceita' | 'recusada'

export type Armazenamento = { getItem(chave: string): string | null; setItem(chave: string, valor: string): void }

export function idDaMedicao(valor: string | undefined = process.env.NEXT_PUBLIC_GA_ID): string | null {
  const id = (valor ?? '').trim() || ID_PADRAO
  if (id.toLowerCase() === 'desligado') return null
  return /^G-[A-Z0-9]{4,16}$/.test(id) ? id : null
}

export function lerEscolha(armazenamento: Armazenamento | null): EscolhaDeMedicao | null {
  try {
    const v = armazenamento?.getItem(CHAVE)
    return v === 'aceita' || v === 'recusada' ? v : null
  } catch {
    return null
  }
}

export function guardarEscolha(escolha: EscolhaDeMedicao, armazenamento: Armazenamento | null): void {
  try {
    armazenamento?.setItem(CHAVE, escolha)
  } catch {}
}
