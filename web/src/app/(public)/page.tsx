'use client'

import { useEffect, useState, useSyncExternalStore } from 'react'
import { useRouter } from 'next/navigation'
import { ArrowRight } from 'lucide-react'
import { LinkButton, Panel, Prazo, Skeleton, StatusTag, Table, TableWrap, Td, Th, THead, Tr } from '@/components/ui'
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

const limite = (v: number | null) => (v === null ? <span className="font-sans">Ilimitado</span> : String(v))
const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

const HORA = 60 * 60 * 1000

const EXEMPLOS = [
  {
    horas: 20,
    objeto: 'Aquisição de carnes e derivados — registro de preços para a alimentação escolar',
    orgao: 'Município de Inhumas',
    uf: 'GO',
    fonte: 'PNCP',
    valor: 'R$ 486.320,00',
  },
  {
    horas: 42,
    objeto: 'Material de limpeza, higiene, copa e cozinha',
    orgao: 'Fundo Municipal de Saúde de Goianésia',
    uf: 'GO',
    fonte: 'ComprasNet',
    valor: 'R$ 128.947,50',
  },
  {
    horas: 3 * 24,
    objeto: 'Manutenção preventiva e corretiva da estação de tratamento de esgoto',
    orgao: 'Município de Itaberaí',
    uf: 'GO',
    fonte: 'PNCP',
    valor: 'R$ 912.000,00',
  },
  {
    horas: 12 * 24,
    objeto: 'Mobiliário e equipamentos de informática para unidades de atendimento',
    orgao: 'Serviço Social do Comércio',
    uf: 'GO',
    fonte: 'SESC',
    valor: 'R$ 274.890,00',
  },
  {
    horas: 21 * 24,
    objeto: 'Pavimentação asfáltica e drenagem pluvial em vias urbanas',
    orgao: 'Companhia Urbanizadora da Nova Capital',
    uf: 'DF',
    fonte: 'Novacap',
    valor: 'R$ 3.418.775,12',
  },
]

const PASSOS = [
  {
    titulo: 'Diga o que você vende',
    texto: 'Cadastre os itens, os códigos CATMAT/CATSER, as UASGs e as regiões que interessam ao seu negócio.',
  },
  {
    titulo: 'Receba só o que bate',
    texto: 'Todo dia o Monitor busca nos portais de compras públicas e separa as licitações abertas que correspondem ao que você cadastrou, ordenadas pelo prazo.',
  },
  {
    titulo: 'Decida e se prepare',
    texto: 'Leia o resumo do edital, confira o que falta na habilitação e registre se vai participar, com os prazos de esclarecimento e impugnação já contados.',
  },
]

const RECURSOS = [
  {
    titulo: 'Busca diária nas fontes',
    texto: 'PNCP, ComprasNet, portais do Sistema S (SESC, SEST SENAT), Novacap e FIEG, filtrados pelos itens, códigos CATMAT/CATSER, UASGs e regiões que você acompanha.',
  },
  {
    titulo: 'Resumo do edital',
    texto: 'Exigências específicas, documentos de habilitação e riscos apontados por severidade. O resumo apoia a leitura: ele não substitui a conferência do edital.',
  },
  {
    titulo: 'Habilitação organizada',
    texto: 'Cofre de documentos com aviso de vencimento e checklist baseado na Lei 14.133/2021, marcado automaticamente com o que você já tem.',
  },
  {
    titulo: 'Prazos sob controle',
    texto: 'Prazo de esclarecimento e impugnação em dias úteis, aviso quando o órgão altera a licitação e plano de participação com a sua decisão registrada.',
  },
]

const FONTES = ['PNCP', 'ComprasNet', 'SESC', 'SEST SENAT', 'FIEG', 'Novacap']

let instanteDaPrevia: number | null = null
const assinarNada = () => () => {}
const lerInstante = () => (instanteDaPrevia ??= Date.now())
const lerInstanteNoServidor = () => null

function PreviaDaLista() {
  const agora = useSyncExternalStore(assinarNada, lerInstante, lerInstanteNoServidor)

  return (
    <figure className="flex min-w-0 flex-col gap-2">
      <Panel
        padding="none"
        title="Licitações abertas"
        description="2 encerram nas próximas 48 h"
        actions={<span className="text-xs text-muted">Ordenadas por prazo</span>}
      >
        <Table className="table-fixed">
          <THead>
            <tr>
              <Th className="w-[136px]">Prazo</Th>
              <Th>Objeto</Th>
              <Th className="hidden w-[124px] sm:table-cell">Fonte</Th>
              <Th align="right" className="hidden w-[152px] sm:table-cell">
                Valor estimado
              </Th>
            </tr>
          </THead>
          <tbody>
            {EXEMPLOS.map((e) => (
              <Tr key={e.objeto}>
                <Td>
                  {agora === null ? (
                    <div className="flex flex-col gap-1.5 py-0.5">
                      <Skeleton className="h-3.5 w-14" />
                      <Skeleton className="h-3 w-20" />
                    </div>
                  ) : (
                    <Prazo data={new Date(agora + e.horas * HORA)} />
                  )}
                </Td>
                <Td>
                  <p className="truncate text-sm text-ink" title={e.objeto}>
                    {e.objeto}
                  </p>
                  <p className="truncate text-xs text-muted">
                    {e.orgao} · {e.uf}
                  </p>
                </Td>
                <Td className="hidden sm:table-cell">
                  <StatusTag title={e.fonte}>{e.fonte}</StatusTag>
                </Td>
                <Td numeric className="hidden sm:table-cell">
                  {e.valor}
                </Td>
              </Tr>
            ))}
          </tbody>
        </Table>
      </Panel>
      <figcaption className="text-xs text-muted">Exemplo com licitações abertas. Órgãos, objetos e valores ilustrativos.</figcaption>
    </figure>
  )
}

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

  const rotuloDoTeste = `Começar teste grátis${dados ? ` de ${dados.trialDias} dias` : ''}`

  return (
    <div className="flex flex-col">
      <section className="mx-auto w-full max-w-[1200px] px-4 pb-16 pt-12 sm:px-6 sm:pt-20">
        <h1 className="max-w-[880px] text-3xl font-semibold tracking-tight text-ink sm:text-4xl">
          As licitações abertas certas para o seu negócio, sem perder nenhum prazo.
        </h1>
        <div className="mt-8 grid items-start gap-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,8fr)] lg:gap-12">
          <div className="flex flex-col gap-6">
            <p className="text-lg text-muted">
              Você cadastra o que vende. O Monitor encontra as oportunidades nos portais de compras públicas, mostra primeiro o que encerra
              antes, resume o edital e mantém a sua habilitação em dia.
            </p>
            <div className="flex flex-wrap gap-3">
              <LinkButton href="/cadastro" variant="primary" iconRight={ArrowRight}>
                {rotuloDoTeste}
              </LinkButton>
              <LinkButton href="/login" variant="secondary">
                Já tenho conta
              </LinkButton>
            </div>
            <p className="text-xs text-muted">Sem cartão de crédito. Um teste por CPF ou CNPJ.</p>
          </div>
          <PreviaDaLista />
        </div>
      </section>

      <section aria-labelledby="como-funciona" className="border-t border-line">
        <div className="mx-auto w-full max-w-[1200px] px-4 py-14 sm:px-6">
          <h2 id="como-funciona" className="text-xl font-semibold tracking-tight text-ink">
            Como funciona
          </h2>
          <ol className="mt-8 grid gap-8 md:grid-cols-3 md:gap-10">
            {PASSOS.map((p, i) => (
              <li key={p.titulo} className="flex flex-col gap-2 border-t border-line-strong pt-4">
                <span className="font-mono text-sm text-faint">{String(i + 1).padStart(2, '0')}</span>
                <h3 className="text-base font-semibold text-ink">{p.titulo}</h3>
                <p className="text-sm text-muted">{p.texto}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section aria-labelledby="o-que-vem-junto" className="border-t border-line">
        <div className="mx-auto grid w-full max-w-[1200px] gap-8 px-4 py-14 sm:px-6 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-12">
          <h2 id="o-que-vem-junto" className="text-xl font-semibold tracking-tight text-ink">
            O que vem junto
          </h2>
          <dl className="grid gap-x-10 gap-y-6 sm:grid-cols-2">
            {RECURSOS.map((r) => (
              <div key={r.titulo} className="flex flex-col gap-1">
                <dt className="text-base font-semibold text-ink">{r.titulo}</dt>
                <dd className="text-sm text-muted">{r.texto}</dd>
              </div>
            ))}
          </dl>
        </div>
      </section>

      <section aria-labelledby="fontes" className="border-y border-line bg-surface">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:gap-6 sm:px-6">
          <h2 id="fontes" className="shrink-0 text-xs font-medium text-muted">
            Fontes monitoradas todo dia
          </h2>
          <ul className="flex flex-wrap gap-2">
            {FONTES.map((f) => (
              <li key={f}>
                <StatusTag>{f}</StatusTag>
              </li>
            ))}
          </ul>
        </div>
      </section>

      {dados && dados.planos.length > 0 && (
        <section aria-labelledby="planos">
          <div className="mx-auto flex w-full max-w-[1200px] flex-col gap-6 px-4 py-14 sm:px-6">
            <div className="flex flex-col gap-1">
              <h2 id="planos" className="text-xl font-semibold tracking-tight text-ink">
                Planos
              </h2>
              <p className="text-sm text-muted">
                A cobrança ainda não está ativa: durante o teste você usa o plano gratuito, e os planos pagos serão divulgados em breve.
              </p>
            </div>
            <TableWrap minWidth={640}>
              <Table>
                <THead>
                  <tr>
                    <Th>Plano</Th>
                    <Th align="right">Preço</Th>
                    <Th align="right">Itens monitorados</Th>
                    <Th align="right">Usuários</Th>
                    <Th align="right">Análises de edital por mês</Th>
                  </tr>
                </THead>
                <tbody>
                  {dados.planos.map((p) => (
                    <Tr key={p.codigo}>
                      <Td>
                        <p className="font-medium text-ink">{p.nome}</p>
                        {p.descricao && <p className="text-xs text-muted">{p.descricao}</p>}
                      </Td>
                      <Td numeric>
                        {p.codigo === 'TESTE' ? <span className="font-sans">Grátis</span> : p.precoMensalCentavos ? `${brl(p.precoMensalCentavos)}/mês` : <span className="font-sans text-muted">Em breve</span>}
                      </Td>
                      <Td numeric>{limite(p.limites.itensMonitorados)}</Td>
                      <Td numeric>{limite(p.limites.usuarios)}</Td>
                      <Td numeric>{limite(p.limites.analisesIaMes)}</Td>
                    </Tr>
                  ))}
                </tbody>
              </Table>
            </TableWrap>
          </div>
        </section>
      )}

      <section aria-labelledby="comece" className="border-t border-line">
        <div className="mx-auto flex w-full max-w-[1200px] flex-col items-start gap-4 px-4 py-14 sm:px-6">
          <h2 id="comece" className="text-xl font-semibold tracking-tight text-ink">
            Veja as licitações abertas para os seus itens hoje.
          </h2>
          <p className="max-w-[640px] text-sm text-muted">
            Você confirma o e-mail, cadastra o que vende e passa a ver as licitações abertas que batem com os seus itens.
          </p>
          <LinkButton href="/cadastro" variant="primary" iconRight={ArrowRight}>
            {rotuloDoTeste}
          </LinkButton>
        </div>
      </section>
    </div>
  )
}
