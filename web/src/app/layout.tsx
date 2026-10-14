import type { Metadata } from 'next'
import localFont from 'next/font/local'
import './globals.css'

const plexSans = localFont({
  variable: '--font-plex-sans',
  display: 'swap',
  src: [
    { path: './fonts/ibm-plex-sans-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-500-normal.woff2', weight: '500', style: 'normal' },
    { path: './fonts/ibm-plex-sans-latin-600-normal.woff2', weight: '600', style: 'normal' },
  ],
})

const plexMono = localFont({
  variable: '--font-plex-mono',
  display: 'swap',
  src: [
    { path: './fonts/ibm-plex-mono-latin-400-normal.woff2', weight: '400', style: 'normal' },
    { path: './fonts/ibm-plex-mono-latin-500-normal.woff2', weight: '500', style: 'normal' },
  ],
})

export const metadata: Metadata = {
  title: 'Monitor de Licitações',
  description: 'Licitações abertas para o seu negócio, com prazo, edital e habilitação no mesmo lugar.',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable} h-full`}>
      <body className="min-h-full bg-canvas text-ink antialiased">{children}</body>
    </html>
  )
}
