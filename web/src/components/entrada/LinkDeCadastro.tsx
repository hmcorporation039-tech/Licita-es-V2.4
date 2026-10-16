'use client'

import type { ComponentProps } from 'react'
import { ArrowRight } from 'lucide-react'
import { LinkButton } from '@/components/ui'
import { rastrear } from '@/lib/rastreamento'

export type OrigemDoCadastro = 'hero' | 'vitrine' | 'final'

type PropsDoLink = ComponentProps<typeof LinkButton>

export default function LinkDeCadastro({
  origem,
  href = '/cadastro',
  onClick,
  ...rest
}: Omit<PropsDoLink, 'href' | 'icon' | 'iconRight'> & { origem: OrigemDoCadastro; href?: PropsDoLink['href'] }) {
  return (
    <LinkButton
      href={href}
      iconRight={ArrowRight}
      onClick={(e) => {
        rastrear('clique_cadastro', { origem })
        onClick?.(e)
      }}
      {...rest}
    />
  )
}
