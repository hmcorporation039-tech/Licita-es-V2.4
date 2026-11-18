// Sem window/document: roda no navegador e também nos testes do Node.

export const PARAMETROS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid'] as const

export type ParametroUtm = (typeof PARAMETROS_UTM)[number]
export type Utm = Partial<Record<ParametroUtm, string>> & { capturadoEm?: string }

const IDS_DO_CLIQUE_NO_ANUNCIO: readonly ParametroUtm[] = ['gclid', 'gbraid', 'wbraid']

/**
 * O que vai junto no cadastro para saber de onde a pessoa veio.
 *
 * O identificador do clique no anúncio (gclid/gbraid/wbraid) só vai se a pessoa aceitou a
 * medição do Google (LGPD). Mas quem chegou por um anúncio do Google e recusou continua
 * contando como Google no Funil: sem o identificador, vai só "google / cpc", que não
 * identifica ninguém. Sem isso, todo clique pago de quem recusa aparecia como "direto".
 */
export function utmParaEnvio(utm: Utm | null, aceitouMedicao: boolean): Partial<Record<ParametroUtm, string>> | undefined {
  if (!utm) return undefined
  const envio: Partial<Record<ParametroUtm, string>> = {}
  for (const chave of PARAMETROS_UTM) {
    if (!aceitouMedicao && IDS_DO_CLIQUE_NO_ANUNCIO.includes(chave)) continue
    const valor = utm[chave]
    if (typeof valor === 'string' && valor.trim()) envio[chave] = valor.trim().slice(0, 200)
  }
  const veioDeAnuncioDoGoogle = IDS_DO_CLIQUE_NO_ANUNCIO.some((chave) => Boolean(utm[chave]?.trim()))
  if (veioDeAnuncioDoGoogle && !envio.utm_source) {
    envio.utm_source = 'google'
    envio.utm_medium ??= 'cpc'
  }
  return Object.keys(envio).length > 0 ? envio : undefined
}
