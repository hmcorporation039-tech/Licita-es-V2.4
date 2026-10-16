import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import {
  ArrowDown,
  ArrowRight,
  Armchair,
  Building,
  Calculator,
  CalendarClock,
  Check,
  ChevronDown,
  CreditCard,
  FilePenLine,
  FileSearch,
  FileText,
  HardHat,
  Landmark,
  Laptop,
  ListChecks,
  LockKeyhole,
  Mic,
  Minus,
  Pill,
  Scale,
  SprayCan,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import { cx, Table, TableWrap, Td, TextLink, Th, THead, Tr } from '@/components/ui'
import AtualizadoHa from '@/components/entrada/AtualizadoHa'
import BarraFixaMovel from '@/components/entrada/BarraFixaMovel'
import BotaoWhatsApp from '@/components/entrada/BotaoWhatsApp'
import BuscarNoRamo from '@/components/entrada/BuscarNoRamo'
import ChegandoAgora from '@/components/entrada/ChegandoAgora'
import EfeitosDaEntrada from '@/components/entrada/EfeitosDaEntrada'
import LinkDeCadastro from '@/components/entrada/LinkDeCadastro'
import { atraso, PreviaAnalisar, PreviaDisputar, PreviaEncontrar, PreviaPreparar } from '@/components/entrada/PreviasDoTour'
import Revelar from '@/components/entrada/Revelar'
import VitrineDeBusca from '@/components/entrada/VitrineDeBusca'
import { carregarDadosDaEntrada, type EstatisticasPublicas, type ListaChegando, type PlanosResposta } from '@/lib/dadosPublicos'

export const revalidate = 600

const TITULO = 'Monitor de Licitações: licitações abertas para o que você vende'
const DESCRICAO =
  'Busca diária no PNCP, ComprasNet, Sistema S e diários oficiais. Aviso do que encerra primeiro, alerta de cláusulas ilegais no edital e proposta no papel timbrado da sua empresa. Teste grátis, sem cartão.'

export const metadata: Metadata = {
  title: TITULO,
  description: DESCRICAO,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Monitor de Licitações',
    title: TITULO,
    description: DESCRICAO,
  },
  twitter: {
    card: 'summary',
    title: TITULO,
    description: DESCRICAO,
  },
}

const CONTEINER = 'mx-auto w-full max-w-[1200px] px-4 sm:px-6'
const TITULO_DE_SECAO = 'text-2xl font-semibold tracking-[-0.01em] text-ink text-balance sm:text-3xl'
const TITULO_DE_SECAO_NOITE = 'text-2xl font-semibold tracking-[-0.01em] text-noite-ink text-balance sm:text-3xl'
const ID_DO_TOPO = 'topo'
const ID_DO_FIM = 'comece'

const FONTES: Array<{ nome: string; detalhe: string; estilo: string }> = [
  { nome: 'PNCP', detalhe: 'Portal Nacional de Contratações Públicas', estilo: 'font-semibold tracking-[0.2em]' },
  { nome: 'ComprasNet', detalhe: 'Compras do Governo Federal', estilo: 'font-semibold tracking-[-0.02em]' },
  { nome: 'SESC', detalhe: 'Nos 27 estados', estilo: 'font-semibold tracking-[0.14em]' },
  { nome: 'SENAI', detalhe: 'Sistema S', estilo: 'font-mono font-medium tracking-[0.08em]' },
  { nome: 'SESI', detalhe: 'Sistema S', estilo: 'font-normal tracking-[0.18em]' },
  { nome: 'SENAC', detalhe: 'Sistema S', estilo: 'font-semibold tracking-[0.1em]' },
  { nome: 'SEST SENAT', detalhe: 'Sistema S', estilo: 'font-mono font-medium tracking-[0.02em]' },
  { nome: 'Diários oficiais', detalhe: 'Municípios do Querido Diário', estilo: 'font-medium tracking-[-0.01em]' },
  { nome: 'novacap', detalhe: 'Brasília/DF', estilo: 'font-semibold tracking-[0.04em]' },
  { nome: 'FIEG', detalhe: 'Federação das Indústrias de Goiás', estilo: 'font-mono font-medium tracking-[0.24em]' },
]

const RAMOS: Array<{ nome: string; termo: string; icone: LucideIcon; texto: string }> = [
  { nome: 'Limpeza e higiene', termo: 'limpeza', icone: SprayCan, texto: 'Material de limpeza, higiene e serviços de conservação para escolas, hospitais e repartições.' },
  { nome: 'Construção e obras', termo: 'construção', icone: HardHat, texto: 'Obras, reformas, pavimentação e manutenção predial, inclusive nos diários municipais.' },
  { nome: 'Informática e tecnologia', termo: 'informática', icone: Laptop, texto: 'Computadores, notebooks, impressoras, rede e software para órgãos de todo o país.' },
  { nome: 'Alimentação', termo: 'gêneros alimentícios', icone: UtensilsCrossed, texto: 'Gêneros alimentícios, merenda escolar e refeições para escolas e unidades públicas.' },
  { nome: 'Saúde e medicamentos', termo: 'medicamentos', icone: Pill, texto: 'Medicamentos, material hospitalar e insumos para a rede pública de saúde.' },
  { nome: 'Mobiliário e escritório', termo: 'mobiliário', icone: Armchair, texto: 'Cadeiras, mesas, armários e material de escritório para órgãos e escolas.' },
]

const DORES: Array<{ icone: LucideIcon; titulo: string; dor: string; solucao: string }> = [
  {
    icone: CalendarClock,
    titulo: 'Prazo perdido',
    dor: 'A licitação certa saiu num portal que ninguém olhou, ou você viu quando o prazo para impugnar já tinha passado.',
    solucao: 'O Monitor mostra primeiro o que encerra antes e conta os prazos de esclarecimento e impugnação em dias úteis.',
  },
  {
    icone: FileSearch,
    titulo: 'Edital de 80 páginas',
    dor: 'Ler o edital inteiro para descobrir, lá no fim, uma exigência que tira a sua empresa da disputa.',
    solucao: 'Resumo do edital por IA com exigências e documentos de habilitação, e alerta quando uma cláusula passa dos limites da Lei 14.133/2021.',
  },
  {
    icone: FilePenLine,
    titulo: 'Proposta e declarações na mão',
    dor: 'Montar proposta, declarações e pedido de impugnação no editor de texto, um por um, a cada licitação.',
    solucao: 'O Monitor gera proposta comercial, declarações e impugnação no papel timbrado da sua empresa, em PDF e Word.',
  },
]

const PASSOS: Array<{ nome: string; titulo: string; texto: string; itens: string[]; previa: () => ReactNode }> = [
  {
    nome: 'Encontrar',
    titulo: 'Diga o que você vende, ou peça para a Bela',
    texto: 'Cadastre itens, códigos CATMAT/CATSER, UASGs e regiões. Todo dia o Monitor busca nas fontes e separa as licitações abertas que batem, ordenadas pelo prazo. Com o microfone, é só falar com a Bela.',
    itens: ['Busca diária em todas as fontes', 'O que encerra primeiro aparece primeiro', 'Aviso quando o órgão altera a licitação'],
    previa: PreviaEncontrar,
  },
  {
    nome: 'Analisar',
    titulo: 'Saiba em minutos se vale a pena entrar',
    texto: 'O resumo do edital traz objeto, valor, exigências e documentos de habilitação. Quando uma cláusula passa dos limites da lei, o Monitor avisa com a gravidade e o artigo.',
    itens: ['Checklist de habilitação marcado com o que já está no seu cofre', 'Prazo de impugnação contado em dias úteis', 'Aviso de vencimento dos seus documentos'],
    previa: PreviaAnalisar,
  },
  {
    nome: 'Preparar',
    titulo: 'Preço calculado e documentos prontos',
    texto: 'No estudo de custos você vê a margem e o preço mínimo antes de propor. Proposta comercial, declarações e impugnação saem no papel timbrado da sua empresa.',
    itens: ['Margem e preço mínimo por item', 'Proposta e declarações em PDF e Word', 'Impugnação e esclarecimento prontos para revisar'],
    previa: PreviaPreparar,
  },
  {
    nome: 'Disputar',
    titulo: 'Na hora do pregão, a Bela faz a conta',
    texto: 'Você registra o melhor lance do portal e a Bela mostra a margem, a faixa de risco e quanto cobrir. Depois da disputa, a proposta readequada ao valor final sai pronta.',
    itens: ['Margem calculada a cada lance', 'Faixa verde, amarela ou vermelha', 'Proposta readequada ao valor final'],
    previa: PreviaDisputar,
  },
]

type Celula = 'sim' | 'nao' | 'parcial' | 'manual'

const COMPARATIVO: Array<{ recurso: string; planilha: Celula; comuns: Celula; monitor: Celula }> = [
  { recurso: 'Busca diária em várias fontes', planilha: 'manual', comuns: 'sim', monitor: 'sim' },
  { recurso: 'Diários oficiais municipais e Sistema S', planilha: 'nao', comuns: 'parcial', monitor: 'sim' },
  { recurso: 'Resumo do edital por IA', planilha: 'nao', comuns: 'parcial', monitor: 'sim' },
  { recurso: 'Alerta de cláusulas fora da lei', planilha: 'nao', comuns: 'nao', monitor: 'sim' },
  { recurso: 'Proposta e declarações no papel timbrado', planilha: 'nao', comuns: 'nao', monitor: 'sim' },
  { recurso: 'Impugnação e esclarecimento prontos', planilha: 'nao', comuns: 'nao', monitor: 'sim' },
  { recurso: 'Estudo de custos e margem', planilha: 'manual', comuns: 'nao', monitor: 'sim' },
  { recurso: 'Copiloto de lances (Bela)', planilha: 'nao', comuns: 'nao', monitor: 'sim' },
]

function CelulaDoComparativo({ valor, destaque = false }: { valor: Celula; destaque?: boolean }) {
  if (valor === 'sim') {
    return (
      <span className={cx('inline-flex items-center justify-center', destaque ? 'text-accent' : 'text-ink-2')}>
        <Check size={16} strokeWidth={2.25} aria-hidden />
        <span className="sr-only">Sim</span>
      </span>
    )
  }
  if (valor === 'nao') {
    return (
      <span className="inline-flex items-center justify-center text-faint">
        <Minus size={16} aria-hidden />
        <span className="sr-only">Não</span>
      </span>
    )
  }
  return <span className="text-xs font-medium text-muted">{valor === 'parcial' ? 'Parcial' : 'Manual'}</span>
}

const perguntasFrequentes = (trialDias: number | null): Array<{ pergunta: string; resposta: ReactNode }> => [
  {
    pergunta: 'Serve para a minha cidade ou o meu estado?',
    resposta:
      'Sim, o Monitor cobre todo o Brasil. Ele busca no PNCP e no ComprasNet, onde publicam órgãos federais, estaduais e municipais, nos portais do Sistema S, na Novacap e na FIEG. Para prefeituras que publicam só no diário oficial, o Monitor lê os diários dos municípios cobertos pelo Querido Diário.',
  },
  {
    pergunta: 'Preciso de certificado digital?',
    resposta: 'Para usar o Monitor, não. Para participar dos pregões no portal do órgão, sim, como sempre: o certificado e o cadastro no portal continuam com a sua empresa.',
  },
  {
    pergunta: 'A Bela dá lance sozinha?',
    resposta: 'Não. A Bela calcula a margem e sugere quanto cobrir. Quem dá o lance é sempre você, no portal.',
  },
  {
    pergunta: 'O resumo do edital substitui a leitura?',
    resposta: 'Não. O resumo apoia a leitura: destaca exigências, documentos e riscos para você saber onde olhar com atenção. A conferência do edital continua sendo sua.',
  },
  {
    pergunta: 'A impugnação gerada é válida?',
    resposta: 'Ela sai como um rascunho completo, com os fatos, o fundamento na lei e o pedido. Revise com o seu advogado antes de protocolar.',
  },
  {
    pergunta: 'Meus dados ficam seguros?',
    resposta: (
      <>
        Os documentos, estudos e propostas da sua empresa ficam no seu cofre, e só os usuários da sua empresa acessam. Os detalhes estão na{' '}
        <TextLink href="/privacidade">Política de Privacidade</TextLink>.
      </>
    ),
  },
  {
    pergunta: 'Como funciona o teste?',
    resposta: `${trialDias ? `São ${trialDias} dias grátis` : 'O teste é grátis'}, sem cartão de crédito. É um teste por CPF ou CNPJ.`,
  },
]

const CONFIANCA: Array<{ icone: LucideIcon; titulo: string; texto: string }> = [
  { icone: Landmark, titulo: 'Dados de fontes públicas oficiais', texto: 'As licitações vêm do PNCP, do ComprasNet, dos portais do Sistema S e dos diários oficiais.' },
  { icone: LockKeyhole, titulo: 'Seus documentos no seu cofre', texto: 'Só a sua empresa acessa os documentos, os estudos e as propostas.' },
  { icone: CreditCard, titulo: 'Teste grátis sem cartão', texto: 'Você usa o Monitor sem informar cartão de crédito.' },
  { icone: Building, titulo: 'Feito em Brasília/DF', texto: 'Desenvolvido pela H&M Engenharia e Tecnologia (Brasília/DF), a partir da rotina real de licitações.' },
]

const limite = (v: number | null) => (v === null ? <span className="font-sans">Ilimitado</span> : String(v))
const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = (valor: number) => valor.toLocaleString('pt-BR')

function numeroDoWhatsApp(): string | null {
  const digitos = (process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos : null
}

function rotuloDoTeste(trialDias: number | null): string {
  return trialDias ? `Testar grátis por ${trialDias} dias` : 'Testar grátis'
}

function NumeroAoVivo({ estatisticas }: { estatisticas: EstatisticasPublicas }) {
  return (
    <div className="flex flex-col gap-1 border-l-2 border-accent pl-4">
      <p className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <span className="text-[2.75rem] font-semibold leading-none tracking-[-0.03em] text-accent sm:text-5xl lg:text-[3.5rem]">{numero(estatisticas.abertas)}</span>
        <span className="text-lg font-medium text-ink">{estatisticas.abertas === 1 ? 'licitação aberta agora' : 'licitações abertas agora'}</span>
      </p>
      <p className="flex flex-wrap items-center gap-x-2 text-xs text-muted">
        <span>Contadas nas fontes que o Monitor acompanha</span>
        {estatisticas.atualizadoEm && (
          <>
            <span aria-hidden>·</span>
            <span>
              atualizado <AtualizadoHa iso={estatisticas.atualizadoEm} />
            </span>
          </>
        )}
      </p>
    </div>
  )
}

const DESTAQUES_DO_HERO = ['O que encerra primeiro aparece primeiro', 'Cláusula fora da lei vira alerta com o artigo', 'Proposta e declarações no papel timbrado']

function Hero({ estatisticas, trialDias, chegando }: { estatisticas: EstatisticasPublicas | null; trialDias: number | null; chegando: ListaChegando }) {
  return (
    <section id={ID_DO_TOPO} aria-labelledby="titulo-principal" className="border-b border-line">
      <div className={cx(CONTEINER, 'grid items-start gap-10 pb-14 pt-10 sm:pt-14 lg:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] lg:gap-14 lg:pb-20 lg:pt-16')}>
        <div className="flex min-w-0 flex-col gap-6">
          <div className="flex flex-col gap-4 sm:gap-5">
            <p className="text-xs font-medium text-muted">PNCP · ComprasNet · Sistema S · Diários oficiais</p>
            <h1 id="titulo-principal" className="text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink text-balance sm:text-4xl sm:leading-[1.12] lg:text-[2.875rem] lg:leading-[1.1]">
              Encontre as licitações abertas para o que você vende <span className="text-accent">— e prepare a proposta no mesmo lugar.</span>
            </h1>
            <p className="max-w-[620px] text-lg leading-7 text-ink-2 sm:text-[1.125rem] sm:leading-8">
              O Monitor busca todos os dias nos portais públicos, avisa o que encerra primeiro, aponta cláusulas ilegais no edital e monta proposta e declarações no papel timbrado da sua empresa.
            </p>
          </div>
          {estatisticas && <NumeroAoVivo estatisticas={estatisticas} />}
          <VitrineDeBusca />
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <LinkDeCadastro origem="hero" variant="primary" className="h-12! px-5! text-base!">
              {rotuloDoTeste(trialDias)}
            </LinkDeCadastro>
            <p className="text-sm text-muted">
              Sem cartão de crédito. Já tem conta?{' '}
              <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent sm:min-h-0">
                Entrar
              </Link>
            </p>
          </div>
        </div>
        <div className="flex min-w-0 flex-col gap-4 lg:sticky lg:top-6">
          <ChegandoAgora itens={chegando.itens} ilustrativo={chegando.ilustrativo} />
          <ul className="flex flex-col gap-2 px-1">
            {DESTAQUES_DO_HERO.map((d) => (
              <li key={d} className="flex items-start gap-2 text-sm text-ink-2">
                <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                {d}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  )
}

function Fontes() {
  return (
    <section aria-labelledby="fontes" className="border-b border-line bg-surface">
      <div className={cx(CONTEINER, 'grid gap-8 py-14 sm:py-16 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:items-center lg:gap-14')}>
        <div className="flex flex-col gap-2">
          <p className="text-xs font-medium text-muted">Onde o Monitor busca, todos os dias</p>
          <h2 id="fontes" className={TITULO_DE_SECAO}>
            10 fontes, uma lista
          </h2>
          <p className="text-base text-muted">
            Portais federais, Sistema S, diários oficiais das prefeituras e portais regionais. O Monitor lê tudo e entrega uma lista só, com o que bate com o que você vende, pelo prazo mais próximo.
          </p>
        </div>
        <Revelar className="flex min-w-0 flex-col items-stretch">
          <ul className="grid grid-cols-2 gap-px overflow-hidden rounded border border-line bg-line md:grid-cols-5">
            {FONTES.map((f, i) => (
              <li key={f.nome} className="revela flex min-h-20 min-w-0 flex-col justify-center gap-1 bg-surface px-3 py-3 sm:px-4" style={atraso(i * 60)}>
                <span className={cx('truncate text-lg leading-6 text-ink', f.estilo)}>{f.nome}</span>
                <span className="text-2xs text-muted">{f.detalhe}</span>
              </li>
            ))}
          </ul>
          <div aria-hidden className="flex flex-col items-center">
            <span className="revela-traco h-5 w-[calc(100%-4rem)] rounded-b border-x border-b border-line-strong" style={atraso(700)} />
            <span className="revela h-5 w-px bg-line-strong" style={atraso(850)} />
          </div>
          <div className="revela-pop flex items-center gap-3 self-center rounded border border-accent bg-accent px-4 py-3 text-white" style={atraso(950)}>
            <ListChecks size={18} strokeWidth={2} className="shrink-0" aria-hidden />
            <span className="text-sm font-medium">Uma lista: o que é para você, pelo prazo mais próximo</span>
          </div>
        </Revelar>
      </div>
    </section>
  )
}

function ContagemDoRamo({ total, termo }: { total: number | null; termo: string }) {
  if (total === null) return null
  if (total === 0) return <p className="text-sm font-medium text-ink-2">Acompanhe novas aberturas</p>
  return (
    <p className="flex flex-col gap-0.5">
      <span className="flex items-baseline gap-2">
        <span className="text-3xl font-semibold leading-none tracking-[-0.02em] text-ink">{numero(total)}</span>
        <span className="text-sm font-medium text-ink-2">{total === 1 ? 'aberta agora' : 'abertas agora'}</span>
      </span>
      <span className="text-xs text-muted">com “{termo}” no objeto</span>
    </p>
  )
}

function Ramos({ totaisPorTermo }: { totaisPorTermo: Record<string, number | null> }) {
  return (
    <section aria-labelledby="ramos" className="border-b border-line">
      <div className={cx(CONTEINER, 'flex flex-col gap-8 py-14 sm:py-20')}>
        <div className="flex max-w-[720px] flex-col gap-2">
          <p className="text-xs font-medium text-muted">Para o seu ramo</p>
          <h2 id="ramos" className={TITULO_DE_SECAO}>
            Licitação tem para o seu tipo de empresa. Veja quantas estão abertas agora.
          </h2>
          <p className="text-base text-muted">Números reais, contados nas licitações abertas que o Monitor acompanha. Toque no seu ramo para ver as que encerram primeiro.</p>
        </div>
        <Revelar>
          <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {RAMOS.map(({ nome, termo, icone: Icone, texto }, i) => (
              <li key={nome} className="revela flex min-w-0 flex-col gap-4 rounded border border-line bg-surface p-5" style={atraso(i * 80)}>
                <div className="flex items-center gap-2.5">
                  <Icone size={18} strokeWidth={1.75} className="shrink-0 text-accent" aria-hidden />
                  <h3 className="text-lg font-semibold text-ink">{nome}</h3>
                </div>
                <ContagemDoRamo total={totaisPorTermo[termo] ?? null} termo={termo} />
                <p className="text-sm text-muted">{texto}</p>
                <div className="mt-auto flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-line-soft pt-4">
                  <BuscarNoRamo
                    ramo={nome}
                    termo={termo}
                    className="inline-flex min-h-11 items-center gap-1.5 text-sm font-semibold text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent"
                  >
                    Ver as licitações abertas
                    <ArrowRight size={14} strokeWidth={2} aria-hidden />
                  </BuscarNoRamo>
                  <Link
                    href={{ pathname: '/cadastro', query: { q: termo } }}
                    className="inline-flex min-h-11 items-center text-sm text-muted underline decoration-line-strong underline-offset-[3px] hover:text-ink"
                  >
                    Monitorar este ramo
                  </Link>
                </div>
              </li>
            ))}
          </ul>
        </Revelar>
      </div>
    </section>
  )
}

function Dores() {
  return (
    <section aria-labelledby="dores" className="border-b border-line bg-surface">
      <div className={cx(CONTEINER, 'flex flex-col gap-8 py-14 sm:py-20')}>
        <div className="flex max-w-[720px] flex-col gap-2">
          <h2 id="dores" className={TITULO_DE_SECAO}>
            Onde se perde uma licitação, e o que o Monitor faz
          </h2>
          <p className="text-base text-muted">Três problemas que fazem empresa boa ficar de fora, resolvidos no mesmo sistema.</p>
        </div>
        <Revelar>
          <ol className="grid gap-4 md:grid-cols-3">
            {DORES.map(({ icone: Icone, titulo, dor, solucao }, i) => (
              <li key={titulo} className="revela flex min-w-0 flex-col overflow-hidden rounded border border-line bg-canvas" style={atraso(i * 120)}>
                <div className="flex flex-col gap-3 px-5 pb-5 pt-5">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
                      <Icone size={18} strokeWidth={2} className="shrink-0 text-danger" aria-hidden />
                      {titulo}
                    </h3>
                    <span className="font-mono text-xs text-faint">{String(i + 1).padStart(2, '0')}</span>
                  </div>
                  <p className="flex flex-col gap-1">
                    <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-muted">Hoje</span>
                    <span className="text-sm text-ink-2">{dor}</span>
                  </p>
                </div>
                <div className="relative mt-auto flex flex-col gap-1 border-t border-accent-line bg-surface px-5 pb-5 pt-6">
                  <span aria-hidden className="absolute -top-3 left-5 inline-flex size-6 items-center justify-center rounded border border-accent-line bg-surface text-accent">
                    <ArrowDown size={14} strokeWidth={2} />
                  </span>
                  <span className="text-2xs font-semibold uppercase tracking-[0.08em] text-accent">No Monitor</span>
                  <span className="text-sm font-medium text-ink">{solucao}</span>
                </div>
              </li>
            ))}
          </ol>
        </Revelar>
      </div>
    </section>
  )
}

function Tour() {
  return (
    <section aria-labelledby="tour" className="border-b border-line">
      <div className={cx(CONTEINER, 'flex flex-col gap-10 py-14 sm:py-20')}>
        <div className="flex max-w-[720px] flex-col gap-2">
          <h2 id="tour" className={TITULO_DE_SECAO}>
            Do edital ao lance, no mesmo lugar
          </h2>
          <p className="text-base text-muted">Quatro etapas de uma licitação e o que o Monitor faz em cada uma. As telas são exemplos ilustrativos, com dados fictícios.</p>
        </div>
        <ol className="flex flex-col">
          {PASSOS.map((p, i) => {
            const Previa = p.previa
            return (
              <li key={p.nome} className="grid gap-6 border-t border-line py-10 first:border-t-0 first:pt-0 last:pb-0 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)] lg:gap-14">
                <Revelar className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-8 lg:self-start lg:pt-2">
                  <p className="revela flex items-center gap-2 text-sm">
                    <span className="font-mono text-faint">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-semibold text-accent">{p.nome}</span>
                  </p>
                  <h3 className="revela text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl" style={atraso(80)}>
                    {p.titulo}
                  </h3>
                  <p className="revela text-base text-ink-2" style={atraso(160)}>
                    {p.texto}
                  </p>
                  <ul className="mt-1 flex flex-col gap-2">
                    {p.itens.map((item, j) => (
                      <li key={item} className="revela flex items-start gap-2 text-sm text-ink" style={atraso(240 + j * 80)}>
                        <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </Revelar>
                <Revelar className="min-w-0 rounded border border-line bg-surface p-3 sm:p-5">
                  <Previa />
                </Revelar>
              </li>
            )
          })}
        </ol>
      </div>
    </section>
  )
}

function PequenaTag({ children, tom = 'neutro' }: { children: ReactNode; tom?: 'neutro' | 'perigo' }) {
  return (
    <span
      className={cx(
        'inline-flex items-center whitespace-nowrap rounded-sm border px-1.5 py-px font-mono text-2xs font-medium',
        tom === 'perigo' ? 'border-danger-line bg-danger-soft text-danger' : 'border-noite-line bg-noite text-noite-ink',
      )}
    >
      {children}
    </span>
  )
}

function TelaDaBela() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="revela flex items-center gap-2.5" style={atraso(200)}>
        <span className="inline-flex size-8 shrink-0 items-center justify-center rounded border border-noite-accent text-noite-accent">
          <Mic size={14} strokeWidth={2} />
        </span>
        <span className="text-sm text-noite-ink">“Bela, o melhor lance agora é R$ 3.112,00”</span>
      </div>
      <div className="revela rounded border border-noite-line bg-noite px-3 py-2.5" style={atraso(500)}>
        <p className="text-sm text-noite-ink">
          Sugiro cobrir com <span className="font-mono font-semibold">R$ 3.084,50</span>
        </p>
        <p className="font-mono text-xs text-noite-muted">margem de 17,7% · acima do seu mínimo</p>
      </div>
    </div>
  )
}

function TelaDaClausula() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="revela flex flex-wrap items-center gap-2" style={atraso(200)}>
        <span className="text-sm text-noite-ink">Atestado de 80% do quantitativo</span>
        <span className="revela-pop" style={atraso(600)}>
          <PequenaTag tom="perigo">Alta</PequenaTag>
        </span>
      </div>
      <p className="revela font-mono text-xs text-noite-muted" style={atraso(400)}>
        Lei 14.133/2021, art. 67, §2º: até 50%
      </p>
      <div className="revela flex items-center justify-between gap-2 rounded border border-noite-line bg-noite px-3 py-2" style={atraso(750)}>
        <span className="flex min-w-0 items-center gap-2 text-sm text-noite-ink">
          <FileText size={14} className="shrink-0 text-noite-muted" />
          <span className="truncate">Pedido de impugnação</span>
        </span>
        <span className="text-xs font-medium text-noite-accent">pronto para revisar</span>
      </div>
    </div>
  )
}

function TelaDoPapelTimbrado() {
  return (
    <div className="flex items-end gap-3">
      <div className="revela-pagina flex aspect-[1/1.25] w-24 shrink-0 flex-col gap-1.5 rounded-sm bg-surface p-2" style={atraso(200)}>
        <span className="flex items-center gap-1.5 border-b border-line-soft pb-1.5">
          <span className="size-2.5 rounded-sm bg-accent" />
          <span className="text-[7px] font-semibold leading-none text-ink">SUA EMPRESA LTDA</span>
        </span>
        {['w-3/4 bg-line', 'w-full bg-line-soft', 'w-full bg-line-soft', 'w-2/3 bg-line-soft'].map((classes, i) => (
          <span key={i} className={cx('revela-traco h-1 rounded-sm', classes)} style={atraso(600 + i * 110)} />
        ))}
      </div>
      <ul className="flex min-w-0 flex-col gap-1.5">
        {['Proposta comercial', 'Declarações', 'Impugnação'].map((nome, i) => (
          <li key={nome} className="revela flex items-center gap-2" style={atraso(500 + i * 140)}>
            <span className="truncate text-sm text-noite-ink">{nome}</span>
            <PequenaTag>PDF</PequenaTag>
            <PequenaTag>DOCX</PequenaTag>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TelaDoEstudo() {
  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-noite-muted">Custo por unidade</span>
        <span className="font-mono text-sm text-noite-ink">R$ 2.620,65</span>
      </div>
      <div className="flex h-2.5 overflow-hidden rounded-sm bg-noite">
        <span className="revela-traco h-full w-[85%] bg-noite-accent/40" style={atraso(250)} />
        <span className="revela-traco h-full w-[15%] bg-noite-accent" style={atraso(650)} />
      </div>
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-xs text-noite-muted">Lance final · margem</span>
        <span className="font-mono text-sm font-semibold text-noite-ink">R$ 3.084,50 · 17,7%</span>
      </div>
      <p className="revela flex items-center gap-2 text-sm text-noite-ink" style={atraso(900)}>
        <Check size={14} strokeWidth={2.25} className="shrink-0 text-noite-accent" />
        Proposta readequada ao valor final
      </p>
    </div>
  )
}

const DIFERENCIAIS: Array<{ icone: LucideIcon; titulo: string; texto: string; tela: () => ReactNode }> = [
  {
    icone: Mic,
    titulo: 'Bela: voz e copiloto de lances',
    texto: 'Fale o que procura e, na hora do pregão, informe o melhor lance do portal: a Bela calcula a margem e diz quanto cobrir. A Bela sugere; quem dá o lance é você.',
    tela: TelaDaBela,
  },
  {
    icone: Scale,
    titulo: 'Cláusulas fora da lei, com impugnação pronta',
    texto: 'O Monitor confere o edital com a Lei 14.133/2021, mostra a cláusula, a gravidade e o artigo, e monta o pedido de impugnação para você revisar.',
    tela: TelaDaClausula,
  },
  {
    icone: FileText,
    titulo: 'Proposta e declarações no papel timbrado',
    texto: 'Proposta comercial, declarações exigidas e impugnação saem com o timbre, o CNPJ e os dados da sua empresa, em PDF e Word.',
    tela: TelaDoPapelTimbrado,
  },
  {
    icone: Calculator,
    titulo: 'Estudo de custos com margem',
    texto: 'Custo, impostos, frete e margem por item, com o preço mínimo antes de propor. Depois do pregão, a proposta readequada ao valor final sai pronta.',
    tela: TelaDoEstudo,
  },
]

function Diferenciais({ trialDias }: { trialDias: number | null }) {
  return (
    <section aria-labelledby="diferenciais" className="faixa-noite border-b border-noite-line">
      <div className={cx(CONTEINER, 'flex flex-col gap-10 py-16 sm:py-24')}>
        <div className="flex max-w-[760px] flex-col gap-3">
          <p className="text-xs font-medium text-noite-accent">Além de avisar</p>
          <h2 id="diferenciais" className={TITULO_DE_SECAO_NOITE}>
            O que nenhum monitor comum faz
          </h2>
          <p className="text-base text-noite-muted">Monitor comum avisa que a licitação saiu. O Monitor de Licitações também lê o edital, prepara os documentos e acompanha você no pregão.</p>
        </div>
        <Revelar>
          <ul className="grid gap-4 md:grid-cols-2">
            {DIFERENCIAIS.map(({ icone: Icone, titulo, texto, tela: Tela }, i) => (
              <li key={titulo} className="revela flex min-w-0 flex-col gap-5 rounded border border-noite-line bg-noite-2 p-5 sm:p-6" style={atraso(i * 120)}>
                <div className="flex flex-col gap-2">
                  <h3 className="flex items-center gap-2.5 text-lg font-semibold text-noite-ink">
                    <Icone size={18} strokeWidth={1.75} className="shrink-0 text-noite-accent" aria-hidden />
                    {titulo}
                  </h3>
                  <p className="text-sm leading-6 text-noite-muted">{texto}</p>
                </div>
                <div aria-hidden className="mt-auto rounded border border-noite-line bg-noite/60 p-4">
                  <Tela />
                </div>
              </li>
            ))}
          </ul>
        </Revelar>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-noite-muted">As telas acima são exemplos ilustrativos, com dados fictícios.</p>
          <LinkDeCadastro origem="diferenciais" variant="secondary" className="h-12! border-surface! px-5! text-base!">
            {rotuloDoTeste(trialDias)}
          </LinkDeCadastro>
        </div>
      </div>
    </section>
  )
}

function Comparativo() {
  return (
    <section aria-labelledby="comparativo" className="border-b border-line">
      <div className={cx(CONTEINER, 'grid gap-8 py-14 sm:py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14')}>
        <div className="flex flex-col gap-2">
          <h2 id="comparativo" className={TITULO_DE_SECAO}>
            O que muda em relação ao que você usa hoje
          </h2>
          <p className="text-base text-muted">Comparação por tipo de ferramenta, pelos recursos mais comuns em cada uma. Não se refere a nenhum produto específico.</p>
        </div>
        <TableWrap>
          <Table className="table-fixed">
            <caption className="sr-only">Comparação de recursos entre planilha e Google, monitores comuns e o Monitor de Licitações</caption>
            <THead>
              <tr>
                <Th className="h-auto! w-[40%] whitespace-normal! py-2.5 pl-3! pr-2! sm:w-[46%] sm:pl-4!">Recurso</Th>
                <Th align="center" className="h-auto! whitespace-normal! px-1.5! py-2.5 sm:px-3!">
                  Planilha e Google
                </Th>
                <Th align="center" className="h-auto! whitespace-normal! px-1.5! py-2.5 sm:px-3!">
                  Monitores comuns
                </Th>
                <Th align="center" className="h-auto! whitespace-normal! bg-accent-soft px-1.5! py-2.5 text-accent! sm:px-3!">
                  Monitor de Licitações
                </Th>
              </tr>
            </THead>
            <tbody>
              {COMPARATIVO.map((linha) => (
                <Tr key={linha.recurso}>
                  <Th scope="row" className="h-auto! whitespace-normal! border-b-0! py-2.5 pl-3! pr-2! text-sm! font-normal! text-ink! sm:pl-4!">
                    {linha.recurso}
                  </Th>
                  <Td className="px-1.5! text-center sm:px-3!">
                    <CelulaDoComparativo valor={linha.planilha} />
                  </Td>
                  <Td className="px-1.5! text-center sm:px-3!">
                    <CelulaDoComparativo valor={linha.comuns} />
                  </Td>
                  <Td className="bg-accent-soft/50 px-1.5! text-center sm:px-3!">
                    <CelulaDoComparativo valor={linha.monitor} destaque />
                  </Td>
                </Tr>
              ))}
            </tbody>
          </Table>
        </TableWrap>
      </div>
    </section>
  )
}

function Confianca({ trialDias }: { trialDias: number | null }) {
  return (
    <section aria-labelledby="confianca" className="border-b border-line bg-surface">
      <div className={cx(CONTEINER, 'flex flex-col gap-5 py-10')}>
        <h2 id="confianca" className="text-xs font-medium text-muted">
          Com quem você está lidando
        </h2>
        <ul className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {CONFIANCA.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo} className="flex min-w-0 items-start gap-3">
              <Icone size={18} strokeWidth={1.75} className="mt-0.5 shrink-0 text-accent" aria-hidden />
              <div className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-semibold text-ink">{titulo}</span>
                <span className="text-sm text-muted">{titulo === 'Teste grátis sem cartão' && trialDias ? `${trialDias} dias para usar o Monitor, sem informar cartão de crédito.` : texto}</span>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Planos({ dados }: { dados: PlanosResposta }) {
  return (
    <section aria-labelledby="planos" className="border-b border-line">
      <div className={cx(CONTEINER, 'flex flex-col gap-6 py-14 sm:py-20')}>
        <div className="flex max-w-[720px] flex-col gap-2">
          <h2 id="planos" className={TITULO_DE_SECAO}>
            Planos
          </h2>
          <p className="text-base text-muted">
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
                    {p.codigo === 'TESTE' ? (
                      <span className="font-sans">Grátis</span>
                    ) : p.precoMensalCentavos ? (
                      `${brl(p.precoMensalCentavos)}/mês`
                    ) : (
                      <span className="font-sans text-muted">Em breve</span>
                    )}
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
  )
}

function PerguntasFrequentes({ trialDias }: { trialDias: number | null }) {
  return (
    <section aria-labelledby="perguntas" className="border-b border-line">
      <div className={cx(CONTEINER, 'grid gap-8 py-14 sm:py-20 lg:grid-cols-[minmax(0,4fr)_minmax(0,8fr)] lg:gap-14')}>
        <h2 id="perguntas" className={TITULO_DE_SECAO}>
          Perguntas frequentes
        </h2>
        <div className="flex flex-col rounded border border-line bg-surface">
          {perguntasFrequentes(trialDias).map((item) => (
            <details key={item.pergunta} className="group border-b border-line-soft last:border-0">
              <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-4 px-4 py-3 text-base font-medium text-ink hover:bg-sunken [&::-webkit-details-marker]:hidden">
                {item.pergunta}
                <ChevronDown size={16} className="shrink-0 text-muted transition-transform group-open:rotate-180" aria-hidden />
              </summary>
              <div className="px-4 pb-4 text-sm leading-6 text-ink-2">{item.resposta}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function ChamadaFinal({ trialDias, estatisticas }: { trialDias: number | null; estatisticas: EstatisticasPublicas | null }) {
  return (
    <section id={ID_DO_FIM} aria-labelledby="comece-titulo" className="faixa-noite">
      <div className={cx(CONTEINER, 'flex flex-col gap-8 py-16 sm:py-24 lg:flex-row lg:items-end lg:justify-between lg:gap-14')}>
        <div className="flex max-w-[760px] flex-col gap-4">
          {estatisticas && (
            <p className="mb-2 flex flex-col gap-2">
              <span className="text-5xl font-semibold leading-none tracking-[-0.03em] text-noite-ink sm:text-7xl">{numero(estatisticas.abertas)}</span>
              <span className="text-lg text-noite-muted">{estatisticas.abertas === 1 ? 'licitação aberta agora.' : 'licitações abertas agora.'}</span>
            </p>
          )}
          <h2 id="comece-titulo" className="text-2xl font-semibold tracking-[-0.01em] text-noite-ink text-balance sm:text-4xl sm:leading-[1.15]">
            {estatisticas ? 'Quantas são para o que você vende?' : 'Veja hoje as licitações abertas para o que você vende.'}
          </h2>
          <p className="text-base text-noite-muted">
            Crie a conta, cadastre os seus itens e veja o que está aberto agora. {trialDias ? `${trialDias} dias grátis, sem cartão de crédito.` : 'Sem cartão de crédito.'}
          </p>
        </div>
        <div className="flex flex-col items-start gap-3 sm:flex-row sm:items-center lg:flex-col lg:items-end">
          <LinkDeCadastro origem="final" variant="secondary" className="h-12! border-surface! px-6! text-base!">
            Criar conta grátis
          </LinkDeCadastro>
          <Link href="/login" className="inline-flex min-h-11 items-center text-sm font-medium text-noite-ink underline decoration-noite-line underline-offset-[3px] hover:decoration-noite-ink">
            Já tenho conta: entrar
          </Link>
        </div>
      </div>
      <div aria-hidden className="h-[calc(4.75rem+env(safe-area-inset-bottom))] sm:hidden" />
    </section>
  )
}

export default async function Home() {
  const { estatisticas, planos, chegando, totaisPorTermo } = await carregarDadosDaEntrada(RAMOS.map((r) => r.termo))
  const trialDias = planos?.trialDias && planos.trialDias > 0 ? planos.trialDias : null
  const whatsapp = numeroDoWhatsApp()

  return (
    <div className="flex flex-col">
      <EfeitosDaEntrada />
      <Hero estatisticas={estatisticas} trialDias={trialDias} chegando={chegando} />
      <Fontes />
      <Ramos totaisPorTermo={totaisPorTermo} />
      <Dores />
      <Tour />
      <Diferenciais trialDias={trialDias} />
      <Comparativo />
      <Confianca trialDias={trialDias} />
      {planos && planos.planos.length > 0 && <Planos dados={planos} />}
      <PerguntasFrequentes trialDias={trialDias} />
      <ChamadaFinal trialDias={trialDias} estatisticas={estatisticas} />
      <BarraFixaMovel idDoTopo={ID_DO_TOPO} idDoFim={ID_DO_FIM} rotuloDoCadastro="Testar grátis" />
      {whatsapp && <BotaoWhatsApp numero={whatsapp} />}
    </div>
  )
}
