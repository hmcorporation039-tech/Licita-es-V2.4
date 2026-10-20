import type { Metadata, Viewport } from 'next'
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

const nunito = localFont({
  variable: '--font-nunito',
  display: 'swap',
  weight: '200 1000',
  src: './fonts/nunito-latin-variable.woff2',
})

export const metadata: Metadata = {
  title: 'Licita Bela',
  description: 'Licitações abertas para o seu negócio, com prazo, edital e habilitação no mesmo lugar.',
  applicationName: 'Licita Bela',
  appleWebApp: { capable: true, title: 'Licita Bela', statusBarStyle: 'default' },
}

export const viewport: Viewport = {
  themeColor: '#0a4fd6',
}

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="pt-BR" className={`${plexSans.variable} ${plexMono.variable} ${nunito.variable} h-full`}>
      <body className="min-h-full bg-canvas text-ink antialiased">{children}</body>
    </html>
  )
}
