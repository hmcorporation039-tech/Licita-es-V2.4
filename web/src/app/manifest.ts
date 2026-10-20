import type { MetadataRoute } from 'next'

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'Licita Bela',
    short_name: 'Licita Bela',
    description: 'Licitações abertas para o seu negócio, com prazo, edital e habilitação no mesmo lugar.',
    id: '/dashboard',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    background_color: '#0a4fd6',
    theme_color: '#0a4fd6',
    lang: 'pt-BR',
    categories: ['business', 'productivity'],
    icons: [
      { src: '/app/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/app/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
    shortcuts: [
      { name: 'Meus matches', url: '/matches', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
      { name: 'Licitações', url: '/tenders', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
      { name: 'Escolhidas', url: '/escolhidas', icons: [{ src: '/app/icon-192.png', sizes: '192x192' }] },
    ],
  }
}
