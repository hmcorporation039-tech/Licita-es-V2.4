import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Link from 'next/link'
import { Building, CalendarClock, Check, ChevronDown, CreditCard, FilePenLine, FileSearch, Landmark, LockKeyhole, Minus, type LucideIcon } from 'lucide-react'
import { cx, Table, TableWrap, Td, Th, THead, TextLink, Tr } from '@/components/ui'
import AtualizadoHa from '@/components/entrada/AtualizadoHa'
import BotaoWhatsApp from '@/components/entrada/BotaoWhatsApp'
import EfeitosDaEntrada from '@/components/entrada/EfeitosDaEntrada'
import LinkDeCadastro from '@/components/entrada/LinkDeCadastro'
import { PreviaAnalisar, PreviaDisputar, PreviaEncontrar, PreviaPreparar } from '@/components/entrada/PreviasDoTour'
import VitrineDeBusca from '@/components/entrada/VitrineDeBusca'
import { buscarEstatisticas, buscarPlanos, type EstatisticasPublicas, type PlanosResposta } from '@/lib/dadosPublicos'

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

const FONTES = [
  { nome: 'PNCP', detalhe: 'Portal Nacional de Contratações Públicas' },
  { nome: 'ComprasNet', detalhe: 'Compras do Governo Federal' },
  { nome: 'Sistema S', detalhe: 'SESC, SENAI, SESI, SENAC, SEST SENAT' },
  { nome: 'Diários oficiais', detalhe: 'Prefeituras cobertas pelo Querido Diário' },
  { nome: 'Novacap', detalhe: 'Companhia Urbanizadora da Nova Capital (DF)' },
  { nome: 'FIEG', detalhe: 'Federação das Indústrias de Goiás' },
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
  { icone: Building, titulo: 'Feito em Brasília/DF', texto: 'Desenvolvido pela H&M Engenharia e Tecnologia.' },
]

const limite = (v: number | null) => (v === null ? <span className="font-sans">Ilimitado</span> : String(v))
const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function numeroDoWhatsApp(): string | null {
  const digitos = (process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos : null
}

function ProvaAoVivo({ estatisticas }: { estatisticas: EstatisticasPublicas }) {
  return (
    <ul aria-label="Números de agora" className="flex flex-wrap gap-x-5 gap-y-1.5 border-t border-line pt-4 text-sm text-ink-2">
      <li>
        <span className="font-mono font-semibold text-ink">{estatisticas.abertas.toLocaleString('pt-BR')}</span>{' '}
        {estatisticas.abertas === 1 ? 'licitação aberta agora' : 'licitações abertas agora'}
      </li>
      <li>
        <span className="font-mono font-semibold text-ink">{estatisticas.fontes.toLocaleString('pt-BR')}</span>{' '}
        {estatisticas.fontes === 1 ? 'fonte com licitações abertas' : 'fontes com licitações abertas'}
      </li>
      {estatisticas.atualizadoEm && (
        <li className="text-muted">
          atualizado <AtualizadoHa iso={estatisticas.atualizadoEm} />
        </li>
      )}
    </ul>
  )
}

function Hero({ estatisticas, trialDias }: { estatisticas: EstatisticasPublicas | null; trialDias: number | null }) {
  return (
    <section aria-labelledby="titulo-principal" className="border-b border-line">
      <div className={cx(CONTEINER, 'grid items-start gap-8 pb-14 pt-10 sm:pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,460px)] lg:grid-rows-[auto_1fr] lg:gap-x-14 lg:gap-y-6 lg:pb-20 lg:pt-20')}>
        <div className="flex min-w-0 flex-col gap-5 sm:gap-6">
          <p className="text-xs font-medium text-muted">PNCP · ComprasNet · Sistema S · Diários oficiais</p>
          <h1 id="titulo-principal" className="text-3xl font-semibold leading-[1.15] tracking-[-0.02em] text-ink text-balance sm:text-4xl sm:leading-[1.12] lg:text-[2.875rem] lg:leading-[1.1]">
            Encontre as licitações abertas para o que você vende <span className="text-accent">— e prepare a proposta no mesmo lugar.</span>
          </h1>
          <p className="max-w-[620px] text-lg leading-7 text-ink-2 sm:text-[1.125rem] sm:leading-8">
            O Monitor busca todos os dias nos portais públicos, avisa o que encerra primeiro, aponta cláusulas ilegais no edital e monta proposta e declarações no papel timbrado da sua empresa.
          </p>
        </div>
        <div className="min-w-0 lg:col-start-2 lg:row-span-2 lg:row-start-1">
          <VitrineDeBusca />
        </div>
        <div className="flex min-w-0 flex-col gap-6 lg:col-start-1 lg:row-start-2">
          <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
            <LinkDeCadastro origem="hero" variant="primary" className="h-11! px-5! text-base!">
              {trialDias ? `Testar grátis por ${trialDias} dias` : 'Testar grátis'}
            </LinkDeCadastro>
            <p className="text-sm text-muted">
              Sem cartão de crédito. Já tem conta?{' '}
              <Link href="/login" className="inline-flex min-h-11 items-center font-medium text-accent underline decoration-accent-line underline-offset-[3px] hover:decoration-accent sm:min-h-0">
                Entrar
              </Link>
            </p>
          </div>
          {estatisticas && <ProvaAoVivo estatisticas={estatisticas} />}
        </div>
      </div>
    </section>
  )
}

function Fontes() {
  return (
    <section aria-labelledby="fontes" className="border-b border-line bg-surface">
      <div className={cx(CONTEINER, 'flex flex-col gap-4 py-8')}>
        <h2 id="fontes" className="text-xs font-medium text-muted">
          Onde o Monitor busca, todos os dias
        </h2>
        <ul className="grid grid-cols-1 gap-px overflow-hidden rounded border border-line bg-line min-[420px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-6">
          {FONTES.map((f) => (
            <li key={f.nome} className="flex min-w-0 flex-col gap-0.5 bg-surface px-4 py-3">
              <span className="text-sm font-semibold text-ink">{f.nome}</span>
              <span className="text-xs text-muted">{f.detalhe}</span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Dores() {
  return (
    <section aria-labelledby="dores" className="border-b border-line">
      <div className={cx(CONTEINER, 'flex flex-col gap-8 py-14 sm:py-20')}>
        <div className="flex max-w-[720px] flex-col gap-2">
          <h2 id="dores" className={TITULO_DE_SECAO}>
            Onde se perde uma licitação, e o que o Monitor faz
          </h2>
          <p className="text-base text-muted">Três problemas que fazem empresa boa ficar de fora, resolvidos no mesmo sistema.</p>
        </div>
        <ul className="grid gap-4 md:grid-cols-3">
          {DORES.map(({ icone: Icone, titulo, dor, solucao }) => (
            <li key={titulo} className="flex min-w-0 flex-col rounded border border-line bg-surface">
              <div className="flex flex-col gap-2 px-5 pb-4 pt-5">
                <h3 className="flex items-center gap-2 text-lg font-semibold text-ink">
                  <Icone size={18} strokeWidth={2} className="shrink-0 text-accent" aria-hidden />
                  {titulo}
                </h3>
                <p className="text-sm text-muted">{dor}</p>
              </div>
              <div className="mt-auto flex flex-col gap-1.5 border-t border-line-soft bg-sunken px-5 py-4">
                <span className="text-xs font-semibold text-accent">No Monitor</span>
                <p className="text-sm text-ink">{solucao}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Tour() {
  return (
    <section aria-labelledby="tour" className="border-b border-line bg-surface">
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
                <div className="flex min-w-0 flex-col gap-3 lg:sticky lg:top-8 lg:self-start lg:pt-2">
                  <p className="flex items-center gap-2 text-sm">
                    <span className="font-mono text-faint">{String(i + 1).padStart(2, '0')}</span>
                    <span className="font-semibold text-accent">{p.nome}</span>
                  </p>
                  <h3 className="text-xl font-semibold tracking-[-0.01em] text-ink sm:text-2xl">{p.titulo}</h3>
                  <p className="text-base text-ink-2">{p.texto}</p>
                  <ul className="mt-1 flex flex-col gap-2">
                    {p.itens.map((item) => (
                      <li key={item} className="flex items-start gap-2 text-sm text-ink">
                        <Check size={16} strokeWidth={2.25} className="mt-0.5 shrink-0 text-accent" aria-hidden />
                        {item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="min-w-0 rounded border border-line bg-canvas p-3 sm:p-5">
                  <Previa />
                </div>
              </li>
            )
          })}
        </ol>
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

function ChamadaFinal({ trialDias }: { trialDias: number | null }) {
  return (
    <section aria-labelledby="comece" className="bg-accent">
      <div className={cx(CONTEINER, 'flex flex-col items-start gap-5 py-14 sm:py-16 lg:flex-row lg:items-center lg:justify-between lg:gap-10')}>
        <div className="flex max-w-[720px] flex-col gap-2">
          <h2 id="comece" className="text-2xl font-semibold tracking-[-0.01em] text-white text-balance sm:text-3xl">
            Veja hoje as licitações abertas para o que você vende.
          </h2>
          <p className="text-base text-accent-soft">
            Crie a conta, cadastre os seus itens e veja o que está aberto agora. {trialDias ? `${trialDias} dias grátis, sem cartão de crédito.` : 'Sem cartão de crédito.'}
          </p>
        </div>
        <LinkDeCadastro origem="final" variant="secondary" className="h-12! border-white! px-5! text-base!">
          Criar conta grátis
        </LinkDeCadastro>
      </div>
    </section>
  )
}

export default async function Home() {
  const [estatisticas, planos] = await Promise.all([buscarEstatisticas(), buscarPlanos()])
  const trialDias = planos?.trialDias && planos.trialDias > 0 ? planos.trialDias : null
  const whatsapp = numeroDoWhatsApp()

  return (
    <div className={cx('flex flex-col', whatsapp && 'pb-20 sm:pb-0')}>
      <EfeitosDaEntrada />
      <Hero estatisticas={estatisticas} trialDias={trialDias} />
      <Fontes />
      <Dores />
      <Tour />
      <Comparativo />
      <Confianca trialDias={trialDias} />
      {planos && planos.planos.length > 0 && <Planos dados={planos} />}
      <PerguntasFrequentes trialDias={trialDias} />
      <ChamadaFinal trialDias={trialDias} />
      {whatsapp && <BotaoWhatsApp numero={whatsapp} />}
    </div>
  )
}
