'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import AcessoEncerrado, { lerDadosDoAcessoEncerrado, type DadosDoAcessoEncerrado } from '@/components/AcessoEncerrado'
import { PublicCard } from '@/components/PublicShell'
import { lerAcessoEncerradoGuardado } from '@/lib/api'

export default function AcessoEncerradoPage() {
  const router = useRouter()
  const [dados, setDados] = useState<DadosDoAcessoEncerrado>({})

  useEffect(() => {
    setDados(lerDadosDoAcessoEncerrado(lerAcessoEncerradoGuardado()))
  }, [])

  return (
    <PublicCard title={dados.emTeste ? 'Seu teste grátis terminou' : 'O acesso da sua conta terminou'} fala="Seus dados continuam guardados. Veja como continuar.">
      <AcessoEncerrado key={dados.acessoAte ?? 'sem-data'} dados={dados} onVoltar={() => router.push('/login')} />
    </PublicCard>
  )
}
