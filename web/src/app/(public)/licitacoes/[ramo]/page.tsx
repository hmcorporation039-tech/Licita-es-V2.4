import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PaginaDoRamo, metadadosDoRamo } from '@/components/PaginaDoRamo'
import { ramoDoSlug } from '@/lib/ramosPublicos'

// Gerada na primeira visita e renovada a cada hora (sem depender da API durante o build).
export const revalidate = 3600

export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ ramo: string }> }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const ramo = ramoDoSlug((await params).ramo)
  return ramo ? metadadosDoRamo(ramo, null) : {}
}

export default async function PaginaNacionalDoRamo({ params }: Props) {
  const ramo = ramoDoSlug((await params).ramo)
  if (!ramo) notFound()
  return <PaginaDoRamo ramo={ramo} estado={null} />
}
