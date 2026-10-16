'use client'

import { useEffect, useState } from 'react'
import { Search } from 'lucide-react'
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
    <div aria-hidden={!visivel} inert={!visivel} data-visivel={visivel} className="az-barra-fixa">
      <LinkDeCadastro origem="barra" className="az-pilula az-pilula-verde az-barra-fixa-cadastro">
        {rotuloDoCadastro}
      </LinkDeCadastro>
      <button
        type="button"
        onClick={() => {
          rastrear('clique_buscar_barra')
          irParaBusca()
        }}
        className="az-pilula az-pilula-contorno"
      >
        <Search size={18} strokeWidth={2.5} aria-hidden />
        Buscar
      </button>
    </div>
  )
}
