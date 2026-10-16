import localFont from 'next/font/local'
import './entrada.css'

const nunito = localFont({
  variable: '--font-nunito',
  display: 'swap',
  weight: '200 1000',
  src: '../fonts/nunito-latin-variable.woff2',
})

export default function LayoutDaEntrada({ children }: { children: React.ReactNode }) {
  return <div className={`${nunito.variable} entrada-azul`}>{children}</div>
}
