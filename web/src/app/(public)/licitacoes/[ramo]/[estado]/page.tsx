import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { PaginaDoRamo, metadadosDoRamo } from '@/components/PaginaDoRamo'
import { estadoDoSlug, ramoDoSlug } from '@/lib/ramosPublicos'

export const revalidate = 3600

export function generateStaticParams() {
  return []
}

type Props = { params: Promise<{ ramo: string; estado: string }> }

async function lerParametros(params: Props['params']) {
  const { ramo, estado } = await params
  return { ramo: ramoDoSlug(ramo), estado: estadoDoSlug(estado) }
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { ramo, estado } = await lerParametros(params)
  return ramo && estado ? metadadosDoRamo(ramo, estado) : {}
}

export default async function PaginaDoRamoNoEstado({ params }: Props) {
  const { ramo, estado } = await lerParametros(params)
  if (!ramo || !estado) notFound()
  return <PaginaDoRamo ramo={ramo} estado={estado} />
}
