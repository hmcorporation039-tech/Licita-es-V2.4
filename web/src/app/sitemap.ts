import type { MetadataRoute } from 'next'
import { enderecoDoSite } from '@/lib/enderecoDoSite'
import { ESTADOS } from '@/lib/estados'
import { RAMOS_PUBLICOS, caminhoDoRamo } from '@/lib/ramosPublicos'

export default function sitemap(): MetadataRoute.Sitemap {
  const site = enderecoDoSite()
  const url = (caminho: string) => new URL(caminho, site).toString()
  return [
    { url: url('/'), changeFrequency: 'daily', priority: 1 },
    { url: url('/licitacoes'), changeFrequency: 'daily', priority: 0.9 },
    ...RAMOS_PUBLICOS.map((r) => ({ url: url(caminhoDoRamo(r)), changeFrequency: 'daily' as const, priority: 0.8 })),
    ...RAMOS_PUBLICOS.flatMap((r) => ESTADOS.map((e) => ({ url: url(caminhoDoRamo(r, e)), changeFrequency: 'daily' as const, priority: 0.6 }))),
    { url: url('/cadastro'), changeFrequency: 'monthly', priority: 0.7 },
    { url: url('/termos'), changeFrequency: 'yearly', priority: 0.3 },
    { url: url('/privacidade'), changeFrequency: 'yearly', priority: 0.3 },
  ]
}
