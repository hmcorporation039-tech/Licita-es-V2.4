import type { MetadataRoute } from 'next'
import { enderecoDoSite } from '@/lib/enderecoDoSite'

export default function sitemap(): MetadataRoute.Sitemap {
  const site = enderecoDoSite()
  return [
    { url: new URL('/', site).toString(), changeFrequency: 'daily', priority: 1 },
    { url: new URL('/cadastro', site).toString(), changeFrequency: 'monthly', priority: 0.8 },
    { url: new URL('/termos', site).toString(), changeFrequency: 'yearly', priority: 0.3 },
    { url: new URL('/privacidade', site).toString(), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
