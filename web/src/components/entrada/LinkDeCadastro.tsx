'use client'

import Link from 'next/link'
import type { ComponentProps } from 'react'
import { ArrowRight } from 'lucide-react'
import { rastrear } from '@/lib/rastreamento'

export type OrigemDoCadastro = 'topo' | 'hero' | 'vitrine' | 'ramo' | 'bela' | 'tour' | 'planos' | 'barra' | 'final'

type PropsDoLink = ComponentProps<typeof Link>

export default function LinkDeCadastro({
  origem,
  href = '/cadastro',
  onClick,
  comSeta = true,
  children,
  ...rest
}: Omit<PropsDoLink, 'href'> & { origem: OrigemDoCadastro; href?: PropsDoLink['href']; comSeta?: boolean }) {
  return (
    <Link
      href={href}
      onClick={(e) => {
        rastrear('clique_cadastro', { origem })
        onClick?.(e)
      }}
      {...rest}
    >
      {children}
      {comSeta && <ArrowRight size={18} strokeWidth={2.5} aria-hidden className="shrink-0" />}
    </Link>
  )
}
