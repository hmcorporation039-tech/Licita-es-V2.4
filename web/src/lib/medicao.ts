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
