// Sem window/document: roda no navegador e também nos testes do Node.

export const PARAMETROS_UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'gclid', 'gbraid', 'wbraid', 'fbclid'] as const

export type ParametroUtm = (typeof PARAMETROS_UTM)[number]
export type Utm = Partial<Record<ParametroUtm, string>> & { capturadoEm?: string }

const IDS_DO_CLIQUE_NO_GOOGLE: readonly ParametroUtm[] = ['gclid', 'gbraid', 'wbraid']
const IDS_DO_CLIQUE_NO_ANUNCIO: readonly ParametroUtm[] = [...IDS_DO_CLIQUE_NO_GOOGLE, 'fbclid']

/**
 * O que vai junto no cadastro para saber de onde a pessoa veio.
 *
 * O identificador do clique no anúncio (gclid/gbraid/wbraid do Google, fbclid da Meta) só vai
 * se a pessoa aceitou a medição (LGPD). Mas quem chegou por um anúncio e recusou continua
 * contando no Funil: sem o identificador, vai só "google / cpc" ou "meta / paid_social", que
 * não identifica ninguém. Sem isso, todo clique pago de quem recusa aparecia como "direto".
 */
export function utmParaEnvio(utm: Utm | null, aceitouMedicao: boolean): Partial<Record<ParametroUtm, string>> | undefined {
  if (!utm) return undefined
  const envio: Partial<Record<ParametroUtm, string>> = {}
  for (const chave of PARAMETROS_UTM) {
    if (!aceitouMedicao && IDS_DO_CLIQUE_NO_ANUNCIO.includes(chave)) continue
    const valor = utm[chave]
    if (typeof valor === 'string' && valor.trim()) envio[chave] = valor.trim().slice(0, 200)
  }
  const veioDeAnuncioDoGoogle = IDS_DO_CLIQUE_NO_GOOGLE.some((chave) => Boolean(utm[chave]?.trim()))
  if (veioDeAnuncioDoGoogle && !envio.utm_source) {
    envio.utm_source = 'google'
    envio.utm_medium ??= 'cpc'
  }
  if (utm.fbclid?.trim() && !envio.utm_source) {
    envio.utm_source = 'meta'
    envio.utm_medium ??= 'paid_social'
  }
  return Object.keys(envio).length > 0 ? envio : undefined
}
