// Login do gov.br aberto no "portal dentro da Bela".
//
// O CAPTCHA do gov.br (hCaptcha) também pesa de onde vem o acesso. O navegador da Bela roda
// num servidor na nuvem, e ali o hCaptcha costuma recusar em silêncio, mesmo com as imagens
// certas: a tela fica girando. A Bela não disfarça o navegador para passar por isso.
// O caminho é o login por QR code do app gov.br (sem CAPTCHA) ou abrir o portal no Chrome
// da própria pessoa, com a extensão.

/** A página aberta é a tela de login do gov.br (sso.acesso.gov.br e afins)? */
export function ehLoginDoGovBr(host: string | null | undefined): boolean {
  if (!host) return false
  const h = host.toLowerCase().replace(/\.$/, '')
  return h === 'acesso.gov.br' || h.endsWith('.acesso.gov.br')
}
