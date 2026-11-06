// Endereço público do site, usado em links absolutos (compartilhamento, sitemap).
// Em produção vem de NEXT_PUBLIC_SITE_URL; sem ela, o domínio próprio.
export const ENDERECO_PADRAO = 'https://www.licitabela.com.br'

export function enderecoDoSite(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || ENDERECO_PADRAO)
  } catch {
    return new URL(ENDERECO_PADRAO)
  }
}
