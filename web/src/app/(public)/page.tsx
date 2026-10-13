'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import PublicShell from '@/components/PublicShell'
import { api } from '@/lib/api'
import { getSessionUser } from '@/lib/session'
import type { Limites } from '@/lib/adminTypes'

interface PlanoPublico {
  codigo: string
  nome: string
  descricao: string | null
  limites: Limites
  precoMensalCentavos: number | null
}

interface PlanosResposta {
  trialDias: number
  planos: PlanoPublico[]
}

const limite = (v: number | null) => (v === null ? 'Ilimitado' : String(v))
const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const RECURSOS = [
  {
    titulo: 'Encontra as licitações para você',
    texto: 'Coleta diária do PNCP, ComprasNet e de portais do Sistema S (SESC, SEST SENAT), Novacap e FIEG, filtrada pelos itens, códigos CATMAT/CATSER, UASGs e regiões que você acompanha.',
  },
  {
    titulo: 'Lê o edital para você',
    texto: 'Resumo, exigências específicas, documentos de habilitação e riscos apontados por severidade. A análise apoia a leitura: ela não substitui a conferência do edital.',
  },
  {
    titulo: 'Organiza a sua habilitação',
    texto: 'Cofre de documentos com aviso de vencimento e checklist baseado na Lei 14.133/2021, marcado automaticamente com o que você já tem.',
  },
  {
    titulo: 'Controla os prazos',
    texto: 'Prazo de esclarecimento e impugnação em dias úteis, avisos quando o órgão altera a licitação e plano de participação com a sua decisão registrada.',
  },
]

export default function Home() {
  const router = useRouter()
  const [dados, setDados] = useState<PlanosResposta | null>(null)

  useEffect(() => {
    if (getSessionUser()) {
      router.replace('/dashboard')
      return
    }
    api.get<PlanosResposta>('/api/public/plans').then(setDados).catch(() => setDados(null))
  }, [router])

  return (
    <PublicShell>
      <section className="py-8 text-center">
        <h1 className="text-3xl font-semibold text-slate-900 md:text-4xl">Monitore licitações públicas sem perder prazo</h1>
        <p className="mx-auto mt-3 max-w-2xl text-slate-600">
          Receba as oportunidades certas para o seu negócio, entenda o edital mais rápido e mantenha a habilitação em dia.
        </p>
        <div className="mt-6 flex justify-center gap-3">
          <Link href="/cadastro" className="rounded bg-indigo-700 px-5 py-2.5 text-sm font-medium text-white hover:bg-indigo-800">
            Começar teste grátis{dados ? ` de ${dados.trialDias} dias` : ''}
          </Link>
          <Link href="/login" className="rounded border border-slate-300 bg-white px-5 py-2.5 text-sm text-slate-700 hover:bg-slate-50">
            Já tenho conta
          </Link>
        </div>
      </section>

      <section className="grid gap-4 py-6 md:grid-cols-2">
        {RECURSOS.map((r) => (
          <div key={r.titulo} className="rounded border border-slate-200 bg-white p-4">
            <h2 className="font-medium text-slate-900">{r.titulo}</h2>
            <p className="mt-1 text-sm text-slate-600">{r.texto}</p>
          </div>
        ))}
      </section>

      {dados && dados.planos.length > 0 && (
        <section className="py-6">
          <h2 className="mb-4 text-center text-xl font-semibold">Planos</h2>
          <div className="grid gap-4 md:grid-cols-4">
            {dados.planos.map((p) => (
              <div key={p.codigo} className="flex flex-col rounded border border-slate-200 bg-white p-4">
                <h3 className="font-medium">{p.nome}</h3>
                <p className="mt-1 min-h-10 text-xs text-slate-500">{p.descricao}</p>
                <p className="mt-3 text-lg font-semibold text-slate-900">
                  {p.codigo === 'TESTE' ? 'Grátis' : p.precoMensalCentavos ? `${brl(p.precoMensalCentavos)}/mês` : 'Em breve'}
                </p>
                <ul className="mt-3 flex flex-col gap-1 text-sm text-slate-600">
                  <li>{limite(p.limites.itensMonitorados)} itens monitorados</li>
                  <li>{limite(p.limites.usuarios)} usuário(s)</li>
                  <li>{limite(p.limites.analisesIaMes)} análises de edital por mês</li>
                </ul>
              </div>
            ))}
          </div>
          <p className="mt-3 text-center text-xs text-slate-500">
            A cobrança ainda não está ativa: durante o teste você usa o plano gratuito, e os planos pagos serão divulgados em breve.
          </p>
        </section>
      )}
    </PublicShell>
  )
}
