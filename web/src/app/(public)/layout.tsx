import localFont from 'next/font/local'
import { PublicFrame } from '@/components/PublicShell'
import './publico.css'

const nunito = localFont({
  variable: '--font-nunito',
  display: 'swap',
  weight: '200 1000',
  src: '../fonts/nunito-latin-variable.woff2',
})

export default function AreaPublicaLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`${nunito.variable} publico-azul`}>
      <PublicFrame>{children}</PublicFrame>
    </div>
  )
}
