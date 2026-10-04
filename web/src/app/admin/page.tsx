'use client'

import Link from 'next/link'
import { useEffect, useState } from 'react'
import AdminShell from '@/components/AdminShell'
import { api, ApiRequestError } from '@/lib/api'
import type { Overview } from '@/lib/adminTypes'

const nf = new Intl.NumberFormat('pt-BR')

function Card({ titulo, valor, detalhe, href }: { titulo: string; valor: string; detalhe?: string; href?: string }) {
  const corpo = (
    <div className="rounded border border-slate-200 bg-white p-4 hover:border-indigo-300">
      <p className="text-xs uppercase tracking-wide text-slate-500">{titulo}</p>
      <p className="mt-1 text-2xl font-semibold text-slate-900">{valor}</p>
      {detalhe && <p className="mt-1 text-xs text-slate-500">{detalhe}</p>}
    </div>
  )
  return href ? <Link href={href}>{corpo}</Link> : corpo
}

export default function AdminVisaoGeralPage() {
  return <AdminShell titulo="Administração da plataforma">{() => <Conteudo />}</AdminShell>
}

function Conteudo() {
  const [ov, setOv] = useState<Overview | null>(null)
  const [erro, setErro] = useState<string | null>(null)

  useEffect(() => {
    api
      .get<Overview>('/api/admin/overview')
      .then(setOv)
      .catch((e) => setErro(e instanceof ApiRequestError ? e.message : 'Erro ao carregar'))
  }, [])

  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!ov) return <p className="text-sm text-slate-500">Carregando...</p>

  const analises = Object.entries(ov.analises)
    .map(([s, n]) => `${n} ${s}`)
    .join(' · ')

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Card titulo="Empresas" valor={nf.format(ov.empresas)} href="/admin/empresas" />
        <Card titulo="Usuários" valor={nf.format(ov.usuarios)} detalhe={`${nf.format(ov.usuariosAtivos)} ativos`} href="/admin/usuarios" />
        <Card titulo="Licitações coletadas" valor={nf.format(ov.licitacoes)} />
        <Card titulo="Itens monitorados" valor={nf.format(ov.itensMonitorados)} detalhe={`${nf.format(ov.documentosNoCofre)} documentos no cofre`} />
        <Card
          titulo="IA no mês"
          valor={`${nf.format(ov.iaNoMes.chamadas)} chamadas`}
          detalhe={`${nf.format(ov.iaNoMes.tokensEntrada)} tokens in · ${nf.format(ov.iaNoMes.tokensSaida)} out${
            ov.iaNoMes.custoEstimadoUsd ? ` · ~US$ ${ov.iaNoMes.custoEstimadoUsd.toFixed(2)}` : ''
          }`}
          href="/admin/uso-ia"
        />
        <Card
          titulo="Análises de edital"
          valor={nf.format(Object.values(ov.analises).reduce((a, b) => a + b, 0))}
          detalhe={analises || 'nenhuma ainda'}
        />
        <Card titulo="Auditoria (24h)" valor={nf.format(ov.eventosDeAuditoriaUltimas24h)} detalhe="eventos registrados" href="/admin/auditoria" />
      </div>
      <p className="text-sm text-slate-500">
        Como administrador você enxerga todas as empresas, e tudo fica registrado na trilha de auditoria, inclusive as suas
        consultas aos dados dos clientes.
      </p>
    </div>
  )
}
