// Página pública de um ramo, no Brasil inteiro ou num estado (SEO).
// Mostra só licitações com prazo de proposta confirmado; o resto do sistema exige login.

import Link from 'next/link'
import type { Metadata } from 'next'
import { ESTADOS, type Estado } from '@/lib/estados'
import { buscarPaginaDeRamo, type PaginaDeRamo } from '@/lib/dadosPublicos'
import { formatarData } from '@/lib/datas'
import { rotuloDaFonte } from '@/lib/fontes'
import { enderecoDoSite } from '@/lib/enderecoDoSite'
import { RAMOS_PUBLICOS, caminhoDoRamo, type RamoPublico } from '@/lib/ramosPublicos'

const numero = new Intl.NumberFormat('pt-BR')

function onde(estado: Estado | null): string {
  return estado ? estado.local : 'em todo o Brasil'
}

export function tituloDoRamo(ramo: RamoPublico, estado: Estado | null): string {
  return `Licitações de ${ramo.de} ${onde(estado)}`
}

export async function metadadosDoRamo(ramo: RamoPublico, estado: Estado | null): Promise<Metadata> {
  const dados = await buscarPaginaDeRamo(ramo.termos, estado?.sigla)
  const titulo = `${tituloDoRamo(ramo, estado)}: abertas hoje`
  const quantas = dados && dados.total > 0 ? `${numero.format(dados.total)} licitações com prazo aberto` : 'Licitações com prazo aberto'
  const descricao = `${quantas} de ${ramo.de} ${onde(estado)}, atualizadas a cada hora a partir do PNCP e dos diários oficiais. Veja prazos, órgãos e cidades e receba as novas por e-mail. Teste grátis.`
  const caminho = caminhoDoRamo(ramo, estado)
  return {
    metadataBase: enderecoDoSite(),
    title: { absolute: `${titulo} · Licita Bela` },
    description: descricao,
    alternates: { canonical: caminho },
    // Página sem nenhuma licitação aberta não ajuda quem pesquisa: fica fora do índice até ter.
    robots: dados && dados.total === 0 ? { index: false, follow: true } : undefined,
    openGraph: { type: 'website', locale: 'pt_BR', siteName: 'Licita Bela', title: titulo, description: descricao, url: caminho },
  }
}

function Prazo({ prazo }: { prazo: string | null }) {
  if (!prazo) return null
  return <span className="font-semibold text-ink">Prazo: {formatarData(prazo, { comHora: true })}</span>
}

function ChamadaParaCadastro({ ramo, estado }: { ramo: RamoPublico; estado: Estado | null }) {
  return (
    <div className="my-8 rounded-2xl border border-accent-line bg-accent-soft p-5">
      <p className="text-lg font-bold text-ink">
        Receba as novas licitações de {ramo.de} {onde(estado)} assim que forem publicadas
      </p>
      <p className="mt-1 text-sm text-muted">
        A Bela avisa por e-mail e no celular, mostra o edital resumido e alerta o prazo de cada uma. Teste grátis, sem cartão.
      </p>
      <Link
        href={{ pathname: '/cadastro', query: { q: ramo.termos[0] } }}
        className="mt-4 inline-block rounded-full bg-accent px-5 py-2.5 font-bold text-white hover:bg-accent-hover"
      >
        Começar teste grátis
      </Link>
    </div>
  )
}

function Lista({ dados }: { dados: PaginaDeRamo }) {
  if (dados.amostras.length === 0) return null
  return (
    <ul className="divide-y divide-line-soft">
      {dados.amostras.map((a, i) => (
        <li key={i} className="py-4">
          <p className="font-semibold text-ink">{a.objeto}</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted">
            {a.orgao && <span>{a.orgao}</span>}
            {a.local && <span>{a.local}</span>}
            <Prazo prazo={a.prazo} />
            <span>Fonte: {rotuloDaFonte(a.fonte)}</span>
          </p>
        </li>
      ))}
    </ul>
  )
}

function DadosEstruturados({ ramo, estado, perguntas }: { ramo: RamoPublico; estado: Estado | null; perguntas: Array<{ p: string; r: string }> }) {
  const site = enderecoDoSite()
  const url = (caminho: string) => new URL(caminho, site).toString()
  const trilha = [
    { nome: 'Licita Bela', caminho: '/' },
    { nome: 'Licitações por ramo', caminho: '/licitacoes' },
    { nome: ramo.nome, caminho: caminhoDoRamo(ramo) },
    ...(estado ? [{ nome: estado.nome, caminho: caminhoDoRamo(ramo, estado) }] : []),
  ]
  const json = [
    {
      '@context': 'https://schema.org',
      '@type': 'BreadcrumbList',
      itemListElement: trilha.map((t, i) => ({ '@type': 'ListItem', position: i + 1, name: t.nome, item: url(t.caminho) })),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: perguntas.map((q) => ({ '@type': 'Question', name: q.p, acceptedAnswer: { '@type': 'Answer', text: q.r } })),
    },
  ]
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(json).replace(/</g, '\\u003c') }} />
}

function perguntasDoRamo(ramo: RamoPublico, estado: Estado | null): Array<{ p: string; r: string }> {
  const local = onde(estado)
  return [
    {
      p: `Onde encontrar licitações de ${ramo.de} ${local}?`,
      r: `Pela Lei 14.133/2021, os órgãos públicos publicam as compras no PNCP (Portal Nacional de Contratações Públicas), mas muitas prefeituras também publicam em diários oficiais e em portais próprios. A Licita Bela junta essas fontes e mostra só as que ainda estão com prazo aberto.`,
    },
    {
      p: `Como participar de uma licitação de ${ramo.de}?`,
      r: 'É preciso ter CNPJ, as certidões de regularidade em dia (federal, FGTS, trabalhista, estadual e municipal) e cadastro no portal onde a disputa acontece, como o Compras.gov.br ou o portal indicado no edital. Depois é ler o edital, enviar a proposta até o prazo e disputar os lances na sessão.',
    },
    {
      p: 'Pequena empresa pode participar?',
      r: 'Sim. Microempresas e empresas de pequeno porte têm tratamento diferenciado na Lei Complementar 123/2006: itens de até R$ 80 mil são exclusivos para elas, e elas têm prazo extra para regularizar certidões e direito de cobrir a proposta vencedora em caso de empate ficto.',
    },
    {
      p: 'De onde vêm estas licitações?',
      r: 'Do PNCP, do Sistema S, de portais estaduais e de diários oficiais municipais. A lista é atualizada a cada hora e só mostra licitações com prazo de proposta confirmado e ainda no futuro. Confira sempre o edital original antes de participar.',
    },
  ]
}

export async function PaginaDoRamo({ ramo, estado }: { ramo: RamoPublico; estado: Estado | null }) {
  const dados = await buscarPaginaDeRamo(ramo.termos, estado?.sigla)
  const perguntas = perguntasDoRamo(ramo, estado)
  const contagemPorUf = new Map((dados?.porUf ?? []).map((u) => [u.uf, u.total]))
  const outrosRamos = RAMOS_PUBLICOS.filter((r) => r.slug !== ramo.slug)

  return (
    <>
      <DadosEstruturados ramo={ramo} estado={estado} perguntas={perguntas} />
      <div className="pb-faixa">
        <div className="pb-conteiner">
          <div className="pb-faixa-conteudo">
            <p className="pb-faixa-rotulo">
              <Link href="/licitacoes" className="hover:underline">
                Licitações por ramo
              </Link>
              {' · '}
              {estado ? (
                <Link href={caminhoDoRamo(ramo)} className="hover:underline">
                  {ramo.nome}
                </Link>
              ) : (
                'Brasil'
              )}
            </p>
            <h1>{tituloDoRamo(ramo, estado)} abertas hoje</h1>
          </div>
        </div>
      </div>
      <article className="pb-documento text-ink-2">
        <p className="text-lg">
          {dados && dados.total > 0 ? (
            <>
              Hoje há <strong className="text-ink">{numero.format(dados.total)} licitações de {ramo.de} com prazo de proposta aberto</strong> {onde(estado)}.
            </>
          ) : dados ? (
            <>
              Neste momento não há licitação de {ramo.de} com prazo aberto {onde(estado)}. Novas licitações são publicadas todos os dias: cadastre-se para ser avisado assim que surgir uma.
            </>
          ) : (
            <>Veja abaixo como acompanhar as licitações de {ramo.de} {onde(estado)}.</>
          )}{' '}
          {ramo.resumo}
        </p>

        <ChamadaParaCadastro ramo={ramo} estado={estado} />

        {dados && dados.amostras.length > 0 && (
          <section>
            <h2 className="mb-1 text-xl font-bold text-ink">Licitações de {ramo.de} que encerram primeiro</h2>
            <p className="text-sm text-muted">Ordenadas pelo prazo de proposta. O edital completo, a análise da Bela e o aviso de prazo ficam na sua conta.</p>
            <Lista dados={dados} />
            {dados.total > dados.amostras.length && (
              <p className="mt-2 text-sm">
                E mais {numero.format(dados.total - dados.amostras.length)} licitações.{' '}
                <Link href={{ pathname: '/cadastro', query: { q: ramo.termos[0] } }} className="font-semibold text-accent underline underline-offset-2">
                  Veja todas no teste grátis
                </Link>
                .
              </p>
            )}
          </section>
        )}

        {dados && dados.porMunicipio.length > 0 && (
          <section className="mt-8">
            <h2 className="mb-3 text-xl font-bold text-ink">Cidades com mais licitações de {ramo.de} abertas</h2>
            <ul className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
              {dados.porMunicipio.map((m) => (
                <li key={`${m.municipio}-${m.uf}`} className="flex justify-between gap-3 border-b border-line-soft py-1.5 text-sm">
                  <span>
                    {m.municipio}
                    {m.uf && !estado ? `/${m.uf}` : ''}
                  </span>
                  <span className="font-semibold text-ink">{numero.format(m.total)}</span>
                </li>
              ))}
            </ul>
          </section>
        )}

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold text-ink">
            {estado ? `${ramo.nome} em outros estados` : `Licitações de ${ramo.de} por estado`}
          </h2>
          <ul className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-3">
            {ESTADOS.filter((e) => e.sigla !== estado?.sigla).map((e) => {
              const total = contagemPorUf.get(e.sigla)
              return (
                <li key={e.sigla}>
                  <Link href={caminhoDoRamo(ramo, e)} className="text-accent hover:underline">
                    {e.nome}
                  </Link>
                  {!estado && total ? <span className="text-muted"> ({numero.format(total)})</span> : null}
                </li>
              )
            })}
          </ul>
          {estado && (
            <p className="mt-3 text-sm">
              <Link href={caminhoDoRamo(ramo)} className="font-semibold text-accent underline underline-offset-2">
                Ver licitações de {ramo.de} em todo o Brasil
              </Link>
            </p>
          )}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold text-ink">O que os órgãos costumam comprar em {ramo.nome.toLowerCase()}</h2>
          <ul className="list-disc space-y-1 pl-5">
            {ramo.exemplos.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold text-ink">Perguntas frequentes</h2>
          {perguntas.map((q) => (
            <div key={q.p} className="mb-4">
              <h3 className="font-bold text-ink">{q.p}</h3>
              <p className="mt-1">{q.r}</p>
            </div>
          ))}
        </section>

        <section className="mt-8">
          <h2 className="mb-3 text-xl font-bold text-ink">Outros ramos {onde(estado)}</h2>
          <ul className="flex flex-wrap gap-2 text-sm">
            {outrosRamos.map((r) => (
              <li key={r.slug}>
                <Link href={caminhoDoRamo(r, estado)} className="inline-block rounded-full border border-line px-3 py-1 text-accent hover:border-accent">
                  {r.nome}
                </Link>
              </li>
            ))}
          </ul>
        </section>

        <ChamadaParaCadastro ramo={ramo} estado={estado} />
      </article>
    </>
  )
}

