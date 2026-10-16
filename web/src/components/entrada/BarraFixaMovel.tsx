'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
import { Button, cx } from '@/components/ui'
import { rastrear } from '@/lib/rastreamento'
import LinkDeCadastro from './LinkDeCadastro'
import { irParaBusca } from './buscaDaEntrada'

export default function BarraFixaMovel({ idDoTopo, idDoFim, rotuloDoCadastro }: { idDoTopo: string; idDoFim: string; rotuloDoCadastro: string }) {
  const [passouDoTopo, setPassouDoTopo] = useState(false)
  const [fimNaTela, setFimNaTela] = useState(false)

  useEffect(() => {
    const topo = document.getElementById(idDoTopo)
    const fim = document.getElementById(idDoFim)
    const rodape = document.querySelector('footer')
    if (!topo || typeof IntersectionObserver === 'undefined') return
    const observadorDoTopo = new IntersectionObserver(([entrada]) => setPassouDoTopo(!entrada.isIntersecting && entrada.boundingClientRect.top < 0))
    observadorDoTopo.observe(topo)
    const visiveisNoFim = new Set<Element>()
    const observadorDoFim = new IntersectionObserver((entradas) => {
      for (const entrada of entradas) {
        if (entrada.isIntersecting) visiveisNoFim.add(entrada.target)
        else visiveisNoFim.delete(entrada.target)
      }
      setFimNaTela(visiveisNoFim.size > 0)
    })
    if (fim) observadorDoFim.observe(fim)
    if (rodape) observadorDoFim.observe(rodape)
    return () => {
      observadorDoTopo.disconnect()
      observadorDoFim.disconnect()
    }
  }, [idDoTopo, idDoFim])

  const visivel = passouDoTopo && !fimNaTela

  return (
    <div
      aria-hidden={!visivel}
      inert={!visivel}
      className={cx(
        'barra-fixa fixed inset-x-0 bottom-0 z-30 border-t border-line bg-surface pt-3 transition-[transform,opacity,visibility] duration-300 ease-out sm:hidden',
        visivel ? 'visible translate-y-0 opacity-100' : 'invisible translate-y-full opacity-0',
      )}
    >
      <div className="flex items-center gap-2">
        <LinkDeCadastro origem="barra" variant="primary" className="h-12! min-w-0 flex-1 text-base!">
          {rotuloDoCadastro}
        </LinkDeCadastro>
        <Button
          type="button"
          variant="secondary"
          icon={Search}
          onClick={() => {
            rastrear('clique_buscar_barra')
            irParaBusca()
          }}
          className="h-12! px-4! text-base!"
        >
          Buscar
        </Button>
      </div>
    </div>
  )
}
