import Link from 'next/link'
import { Notice } from '@/components/ui'
import { versaoDoPncp } from '@/lib/licitacaoNaTela'

export default function AvisoDeVersaoDoPncp({ tender, className }: { tender: { duplicataDe?: string | null }; className?: string }) {
  const link = versaoDoPncp(tender)
  if (!link) return null
  return (
    <Notice tone="warn" className={className} title="Esta licitação também foi publicada no PNCP">
      Este aviso não aparece mais nas buscas: prazo e situação atualizados ficam na versão do PNCP.{' '}
      <Link href={link} className="font-medium text-accent underline underline-offset-[3px]">
        Abrir a versão do PNCP
      </Link>
    </Notice>
  )
}
