import type { MetadataRoute } from 'next'
import { enderecoDoSite } from '@/lib/enderecoDoSite'

// Só as páginas públicas interessam aos buscadores; o sistema exige login.
export default function robots(): MetadataRoute.Robots {
  const site = enderecoDoSite()
  return {
    rules: {
      userAgent: '*',
      allow: ['/', '/cadastro', '/termos', '/privacidade'],
      disallow: [
        '/api/',
        '/admin',
        '/base-de-precos',
        '/conta',
        '/dashboard',
        '/empresa',
        '/escolhidas',
        '/guia',
        '/items',
        '/matches',
        '/portais',
        '/radar',
        '/salvas',
        '/suporte',
        '/tenders',
      ],
    },
    sitemap: new URL('/sitemap.xml', site).toString(),
  }
}
