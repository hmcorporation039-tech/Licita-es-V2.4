import type { Metadata } from 'next'
import type { ReactNode } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import {
  Armchair,
  ArrowRight,
  Building,
  Check,
  ChevronDown,
  CreditCard,
  HardHat,
  Landmark,
  Laptop,
  LockKeyhole,
  Mic,
  Minus,
  Pill,
  SprayCan,
  UtensilsCrossed,
  type LucideIcon,
} from 'lucide-react'
import AtualizadoHa from '@/components/entrada/AtualizadoHa'
import BarraFixaMovel from '@/components/entrada/BarraFixaMovel'
import BelaEmMovimento from '@/components/entrada/BelaEmMovimento'
import BotaoWhatsApp, { LinkDoWhatsApp } from '@/components/entrada/BotaoWhatsApp'
import BuscarNoRamo from '@/components/entrada/BuscarNoRamo'
import ChegandoAgora from '@/components/entrada/ChegandoAgora'
import EfeitosDaEntrada from '@/components/entrada/EfeitosDaEntrada'
import FaixaDeFontes, { FONTES_OFICIAIS } from '@/components/entrada/FaixaDeFontes'
import { fontesComLicitacaoAberta } from '@/lib/fontes'
import FalaDaBelaNoHeroi from '@/components/entrada/FalaDaBelaNoHeroi'
import LinkDeCadastro from '@/components/entrada/LinkDeCadastro'
import NumeroQueSobe from '@/components/entrada/NumeroQueSobe'
import OuvirABela from '@/components/entrada/OuvirABela'
import { atraso, MolduraDeCelular, PreviaAnalisar, PreviaDisputar, PreviaEncontrar, PreviaPreparar } from '@/components/entrada/PreviasDoTour'
import Revelar from '@/components/entrada/Revelar'
import VitrineDeBusca from '@/components/entrada/VitrineDeBusca'
import { carregarDadosDaEntrada, type EstatisticasPublicas, type ListaChegando, type PlanosResposta } from '@/lib/dadosPublicos'

export const revalidate = 600

const TITULO = 'Monitor de Licitações: licitações abertas para o que você vende'
const DESCRICAO =
  'Busca diária no PNCP, no Sistema S e nos diários oficiais. Aviso do que encerra primeiro, alerta de cláusulas ilegais no edital e proposta no papel timbrado da sua empresa. Teste grátis, sem cartão.'
const ENDERECO_PADRAO = 'https://licita-es-v2-4.vercel.app'
const IMAGEM_DE_COMPARTILHAMENTO = { url: '/bela/bela-compartilhar.jpg', width: 1200, height: 670, alt: 'Bela, a assistente do Monitor de Licitações' }

function enderecoDoSite(): URL {
  try {
    return new URL(process.env.NEXT_PUBLIC_SITE_URL || ENDERECO_PADRAO)
  } catch {
    return new URL(ENDERECO_PADRAO)
  }
}

export const metadata: Metadata = {
  metadataBase: enderecoDoSite(),
  title: TITULO,
  description: DESCRICAO,
  openGraph: {
    type: 'website',
    locale: 'pt_BR',
    siteName: 'Monitor de Licitações',
    title: TITULO,
    description: DESCRICAO,
    images: [IMAGEM_DE_COMPARTILHAMENTO],
  },
  twitter: {
    card: 'summary_large_image',
    title: TITULO,
    description: DESCRICAO,
    images: [IMAGEM_DE_COMPARTILHAMENTO.url],
  },
}

const ID_DO_TOPO = 'topo'
const ID_DO_FIM = 'comece'
const TERMO_DA_BELA = 'material de limpeza'

const RAMOS: Array<{ nome: string; termo: string; icone: LucideIcon; texto: string; tom: string }> = [
  { nome: 'Limpeza e higiene', termo: 'limpeza', icone: SprayCan, tom: 'az-tom-agua', texto: 'Material de limpeza, higiene e conservação para escolas, hospitais e repartições.' },
  { nome: 'Construção e obras', termo: 'construção', icone: HardHat, tom: 'az-tom-ambar', texto: 'Obras, reformas, pavimentação e manutenção predial, inclusive nos diários municipais.' },
  { nome: 'Informática e tecnologia', termo: 'informática', icone: Laptop, tom: 'az-tom-azul', texto: 'Computadores, notebooks, impressoras, rede e software para órgãos de todo o país.' },
  { nome: 'Alimentação', termo: 'gêneros alimentícios', icone: UtensilsCrossed, tom: 'az-tom-coral', texto: 'Gêneros alimentícios, merenda escolar e refeições para escolas e unidades públicas.' },
  { nome: 'Saúde e medicamentos', termo: 'medicamentos', icone: Pill, tom: 'az-tom-rosa', texto: 'Medicamentos, material hospitalar e insumos para a rede pública de saúde.' },
  { nome: 'Mobiliário e escritório', termo: 'mobiliário', icone: Armchair, tom: 'az-tom-violeta', texto: 'Cadeiras, mesas, armários e material de escritório para órgãos e escolas.' },
]

const COMANDOS_DA_BELA: Array<{ pedido: string; resposta: ReactNode }> = [
  { pedido: 'Bela, licitação de material de limpeza em Goiás', resposta: 'Separei as abertas em Goiás, pela que encerra primeiro. Quer que eu abra a primeira?' },
  { pedido: 'Bela, pregão eletrônico de notebook no DF, só as abertas', resposta: 'Entendi: notebook, pregão eletrônico, DF, abertas. Aqui está a lista.' },
  {
    pedido: 'Bela, o melhor lance agora é 3.112 reais',
    resposta: (
      <>
        Sugiro cobrir com <b>R$ 3.084,50</b>. Sua margem fica em <b>17,7%</b>, acima do seu mínimo.
      </>
    ),
  },
]

const PASSOS: Array<{ nome: string; titulo: string; texto: string; itens: string[]; previa: () => ReactNode; tom: string }> = [
  {
    nome: 'Encontrar',
    titulo: 'Diga o que você vende, ou peça para a Bela',
    texto: 'Cadastre itens, códigos CATMAT/CATSER, UASGs e regiões. Todo dia o Monitor busca nas fontes e separa as licitações abertas que batem, ordenadas pelo prazo.',
    itens: ['Busca diária em todas as fontes', 'O que encerra primeiro aparece primeiro', 'Aviso quando o órgão altera a licitação'],
    previa: PreviaEncontrar,
    tom: 'az-tom-azul',
  },
  {
    nome: 'Analisar',
    titulo: 'Saiba em minutos se vale a pena entrar',
    texto: 'O resumo do edital traz objeto, valor, exigências e documentos de habilitação. Quando uma cláusula passa dos limites da lei, o Monitor avisa com a gravidade e o artigo.',
    itens: ['Checklist de habilitação com o que já está no seu cofre', 'Prazo de impugnação contado em dias úteis', 'Aviso de vencimento dos seus documentos'],
    previa: PreviaAnalisar,
    tom: 'az-tom-coral',
  },
  {
    nome: 'Preparar',
    titulo: 'Preço calculado e documentos prontos',
    texto: 'No estudo de custos você vê a margem e o preço mínimo antes de propor. Proposta comercial, declarações e impugnação saem no papel timbrado da sua empresa.',
    itens: ['Margem e preço mínimo por item', 'Proposta e declarações em PDF e Word', 'Impugnação e esclarecimento prontos para revisar'],
    previa: PreviaPreparar,
    tom: 'az-tom-agua',
  },
  {
    nome: 'Disputar',
    titulo: 'Na hora do pregão, a Bela faz a conta',
    texto: 'Você informa o melhor lance do portal e a Bela mostra a margem, a faixa de risco e quanto cobrir. Depois da disputa, a proposta readequada ao valor final sai pronta.',
    itens: ['Margem calculada a cada lance', 'Faixa verde, amarela ou vermelha', 'Proposta readequada ao valor final'],
    previa: PreviaDisputar,
    tom: 'az-tom-violeta',
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
  { recurso: 'Assistente por voz e copiloto de lances', planilha: 'nao', comuns: 'nao', monitor: 'sim' },
]

const CONFIANCA: Array<{ icone: LucideIcon; titulo: string; texto: string }> = [
  { icone: Landmark, titulo: 'Dados de fontes públicas oficiais', texto: 'As licitações vêm do PNCP, que reúne o que os órgãos publicam no Compras.gov.br e nos demais portais, dos portais do Sistema S e dos diários oficiais.' },
  { icone: LockKeyhole, titulo: 'Seus documentos no seu cofre', texto: 'Só os usuários da sua empresa acessam os documentos, os estudos e as propostas.' },
  { icone: CreditCard, titulo: 'Teste grátis sem cartão', texto: 'Você usa o Monitor sem informar cartão de crédito.' },
  { icone: Building, titulo: 'Feito em Brasília/DF', texto: 'Desenvolvido pela H&M Engenharia e Tecnologia, a partir da rotina real de licitações.' },
]

const perguntasFrequentes = (trialDias: number | null): Array<{ pergunta: string; resposta: ReactNode }> => [
  {
    pergunta: 'Serve para a minha cidade ou o meu estado?',
    resposta:
      'Sim, o Monitor cobre todo o Brasil. Ele busca no PNCP, onde órgãos federais, estaduais e municipais publicam as licitações (inclusive as feitas pelo Compras.gov.br), nos portais do Sistema S, na Novacap e na FIEG. Para prefeituras que publicam só no diário oficial, o Monitor lê os diários dos municípios cobertos pelo Querido Diário.',
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
    pergunta: 'Preciso falar com a Bela ou dá para digitar?',
    resposta: 'Os dois. A voz funciona nos navegadores que reconhecem fala, como Chrome e Edge. Nos outros, você digita o mesmo pedido.',
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
        <Link href="/privacidade" className="az-link">
          Política de Privacidade
        </Link>
        .
      </>
    ),
  },
  {
    pergunta: 'Como funciona o teste?',
    resposta: `${trialDias ? `São ${trialDias} dias grátis` : 'O teste é grátis'}, sem cartão de crédito. É um teste por CPF ou CNPJ.`,
  },
]

const numero = (valor: number) => valor.toLocaleString('pt-BR')
const textoDasFontesNoHeroi = (fontes: number | null) => (fontes && fontes > 1 ? `em ${fontes} fontes públicas` : 'nas fontes públicas oficiais')
const brl = (centavos: number) => (centavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

function numeroDoWhatsApp(): string | null {
  const digitos = (process.env.NEXT_PUBLIC_WHATSAPP ?? '').replace(/\D/g, '')
  return digitos.length >= 10 ? digitos : null
}

function Aneis({ variante }: { variante: 'heroi' | 'final' | 'retrato' }) {
  return (
    <>
      <span aria-hidden className={`az-anel az-anel-${variante}-a`} />
      <span aria-hidden className={`az-anel az-anel-${variante}-b`} />
    </>
  )
}

function TituloDeSecao({ id, fino, forte, apoio, sobretitulo }: { id: string; fino: string; forte: string; apoio?: ReactNode; sobretitulo?: string }) {
  return (
    <div className="az-secao-cabecalho">
      {sobretitulo && <p className="az-sobretitulo">{sobretitulo}</p>}
      <h2 id={id} className="az-secao-titulo">
        <span className="az-fino">{fino}</span> <span className="az-forte">{forte}</span>
      </h2>
      {apoio && <p className="az-secao-apoio">{apoio}</p>}
    </div>
  )
}

function Navegacao() {
  return (
    <header className="az-nav">
      <Link href="/" className="az-marca" aria-label="Monitor de Licitações, página inicial">
        Monitor <span>de Licitações</span>
      </Link>
      <nav aria-label="Principal" className="az-nav-acoes">
        <a href="#bela" className="az-nav-link">
          Bela
        </a>
        <a href="#tour" className="az-nav-link">
          Como funciona
        </a>
        <a href="#planos" className="az-nav-link">
          Planos
        </a>
        <Link href="/login" className="az-pilula az-pilula-vazada az-nav-entrar">
          Entrar
        </Link>
        <LinkDeCadastro origem="topo" comSeta={false} className="az-pilula az-pilula-branca">
          Teste grátis
        </LinkDeCadastro>
      </nav>
    </header>
  )
}

function Provas({ estatisticas, trialDias }: { estatisticas: EstatisticasPublicas | null; trialDias: number | null }) {
  const fontes = fontesComLicitacaoAberta(estatisticas?.fontes, FONTES_OFICIAIS.length)
  return (
    <dl className="az-provas">
      {estatisticas && (
        <div>
          <dt className="sr-only">Licitações abertas agora</dt>
          <dd>
            <NumeroQueSobe valor={estatisticas.abertas} className="az-provas-numero" />
            <span className="az-provas-rotulo">
              {estatisticas.abertas === 1 ? 'licitação aberta agora' : 'licitações abertas agora'}
              {estatisticas.atualizadoEm && (
                <small>
                  atualizado <AtualizadoHa iso={estatisticas.atualizadoEm} />
                </small>
              )}
            </span>
          </dd>
        </div>
      )}
      {fontes && (
        <div>
          <dt className="sr-only">Fontes públicas</dt>
          <dd>
            <span className="az-provas-numero">{fontes}</span>
            <span className="az-provas-rotulo">{fontes === 1 ? 'fonte pública com licitação aberta agora' : 'fontes públicas com licitação aberta agora'}</span>
          </dd>
        </div>
      )}
      <div>
        <dt className="sr-only">Teste</dt>
        <dd>
          <span className="az-provas-numero">{trialDias ? `${trialDias} dias` : 'Grátis'}</span>
          <span className="az-provas-rotulo">{trialDias ? 'grátis, sem cartão' : 'teste sem cartão'}</span>
        </dd>
      </div>
    </dl>
  )
}

function Heroi({
  estatisticas,
  trialDias,
  chegando,
  totalDaBela,
  prazoDaBela,
}: {
  estatisticas: EstatisticasPublicas | null
  trialDias: number | null
  chegando: ListaChegando
  totalDaBela: number | null
  prazoDaBela: string | null
}) {
  return (
    <section id={ID_DO_TOPO} aria-labelledby="titulo-principal" className="az-heroi az-escuro">
      <Aneis variante="heroi" />
      <div className="az-conteiner">
        <Navegacao />
        <div className="az-heroi-grade">
          <div className="az-heroi-texto">
            <p className="az-etiqueta">
              <span aria-hidden className="az-etiqueta-selo">
                ML
              </span>
              Licitações para o seu negócio
            </p>
            <h1 id="titulo-principal" className="az-heroi-titulo">
              <span className="az-fino">Licitação aberta,</span>
              <span className="az-forte">proposta pronta.</span>
              <span className="az-claro">tudo num lugar só</span>
            </h1>
            <p className="az-heroi-sub">
              Você diz o que vende. O Monitor encontra as licitações abertas {textoDasFontesNoHeroi(fontesComLicitacaoAberta(estatisticas?.fontes, FONTES_OFICIAIS.length))}, avisa o que encerra primeiro e monta a proposta no papel timbrado da sua empresa.
            </p>
            <VitrineDeBusca />
            <Provas estatisticas={estatisticas} trialDias={trialDias} />
          </div>
          <div className="az-palco">
            <span aria-hidden className="az-palco-brilho" />
            <BelaEmMovimento variante="heroi" alt="Bela, a assistente por voz do Monitor de Licitações, sorrindo com o celular na mão" className="az-palco-bela" />
            <FalaDaBelaNoHeroi total={totalDaBela} termo={TERMO_DA_BELA} primeiroPrazo={prazoDaBela} className="az-balao az-palco-balao" />
            <div className="az-palco-celular">
              <MolduraDeCelular>
                <ChegandoAgora itens={chegando.itens} ilustrativo={chegando.ilustrativo} />
              </MolduraDeCelular>
            </div>
          </div>
        </div>
        <p className="az-palco-legenda">
          {chegando.ilustrativo
            ? 'No celular: exemplo ilustrativo, com dados fictícios. Busque o que você vende para ver as licitações reais.'
            : 'No celular: amostra real de licitações abertas que o Monitor acompanha.'}
        </p>
      </div>
    </section>
  )
}

function ContagemDoRamo({ total, termo }: { total: number | null; termo: string }) {
  if (total === null) return null
  if (total === 0) return <p className="az-ramo-vazio">Acompanhe novas aberturas</p>
  return (
    <p className="az-ramo-contagem">
      <span className="az-ramo-numero">
        <NumeroQueSobe valor={total} />
        <small>{total === 1 ? 'aberta agora' : 'abertas agora'}</small>
      </span>
      <span className="az-ramo-termo">com “{termo}” no objeto</span>
    </p>
  )
}

function Ramos({ totaisPorTermo }: { totaisPorTermo: Record<string, number | null> }) {
  return (
    <section id="ramos" aria-labelledby="ramos-titulo" className="az-secao">
      <div className="az-conteiner">
        <TituloDeSecao
          id="ramos-titulo"
          fino="Tem licitação para o"
          forte="seu tipo de empresa"
          apoio="Números reais de licitações abertas agora, por ramo. Toque no seu e veja as que encerram primeiro."
        />
        <Revelar>
          <ul className="az-ramos">
            {RAMOS.map(({ nome, termo, icone: Icone, texto, tom }, i) => (
              <li key={nome} className={`revela az-ramo ${tom}`} style={atraso(i * 80)}>
                <span aria-hidden className="az-ramo-icone">
                  <Icone size={22} strokeWidth={2.25} />
                </span>
                <h3>{nome}</h3>
                <ContagemDoRamo total={totaisPorTermo[termo] ?? null} termo={termo} />
                <p className="az-ramo-texto">{texto}</p>
                <div className="az-ramo-acoes">
                  <BuscarNoRamo ramo={nome} termo={termo} className="az-pilula az-pilula-azul az-pilula-pequena">
                    Ver as abertas
                    <ArrowRight size={16} strokeWidth={2.5} aria-hidden />
                  </BuscarNoRamo>
                  <Link href={{ pathname: '/cadastro', query: { q: termo } }} className="az-link az-ramo-monitorar">
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

function ConhecaABela({ trialDias }: { trialDias: number | null }) {
  return (
    <section id="bela" aria-labelledby="bela-titulo" className="az-secao az-bela">
      <div className="az-conteiner az-bela-grade">
        <Revelar className="az-bela-retrato az-escuro">
          <Aneis variante="retrato" />
          <BelaEmMovimento variante="secao" alt="Bela, a assistente do Monitor de Licitações, de blazer azul, sorrindo" className="az-bela-foto" />
          <div aria-hidden className="revela-pop az-bela-ouvindo" style={atraso(300)}>
            <span className="az-bela-onda">
              <span />
              <span />
              <span />
              <span />
            </span>
            <Mic size={16} strokeWidth={2.5} />
            Ouvindo…
          </div>
          <div aria-hidden className="revela-direita az-bela-cartao" style={atraso(600)}>
            <small>Pregão · item 1</small>
            <strong>
              Margem <b>17,7%</b>
            </strong>
            <span>Cobrir com R$ 3.084,50</span>
          </div>
        </Revelar>
        <div className="az-bela-texto">
          <p className="az-sobretitulo">Conheça a Bela</p>
          <h2 id="bela-titulo" className="az-secao-titulo az-alinhado-esquerda">
            <span className="az-fino">A assistente que</span> <span className="az-forte">trabalha por voz</span>
          </h2>
          <p className="az-bela-apoio">
            A Bela é a assistente por voz do Monitor. Você busca falando, ela acompanha o pregão com você e sugere o lance com a margem calculada. <b>A Bela sugere; quem dá o lance é você.</b>
          </p>
          <ol className="az-conversa" aria-label="Exemplos de pedidos para a Bela">
            {COMANDOS_DA_BELA.map((c) => (
              <li key={c.pedido} className="az-conversa-par">
                <p className="az-conversa-voce">
                  <Mic size={14} strokeWidth={2.5} aria-hidden />
                  <span className="sr-only">Você: </span>“{c.pedido}”
                </p>
                <p className="az-conversa-bela">
                  <span className="az-conversa-autora">Bela</span>
                  {c.resposta}
                </p>
              </li>
            ))}
          </ol>
          <div className="az-bela-acoes">
            <OuvirABela className="az-pilula az-pilula-azul" />
            <LinkDeCadastro origem="bela" className="az-pilula az-pilula-verde">
              {trialDias ? `Testar a Bela por ${trialDias} dias` : 'Testar a Bela grátis'}
            </LinkDeCadastro>
          </div>
          <p className="az-nota-pequena">Conversas acima são exemplos ilustrativos. A voz funciona nos navegadores que reconhecem fala, como Chrome e Edge; nos outros, é só digitar.</p>
        </div>
      </div>
    </section>
  )
}

function Tour({ trialDias }: { trialDias: number | null }) {
  return (
    <section id="tour" aria-labelledby="tour-titulo" className="az-secao az-secao-branca">
      <div className="az-conteiner">
        <TituloDeSecao id="tour-titulo" fino="Do edital ao lance," forte="no mesmo lugar" apoio="Quatro etapas de uma licitação e o que o Monitor faz em cada uma. As telas são exemplos ilustrativos, com dados fictícios." />
        <ol className="az-passos">
          {PASSOS.map((p, i) => {
            const Previa = p.previa
            return (
              <li key={p.nome} className="az-passo">
                <Revelar className="az-passo-texto">
                  <p className="revela az-passo-rotulo">
                    <span className="az-passo-numero">{String(i + 1).padStart(2, '0')}</span>
                    {p.nome}
                  </p>
                  <h3 className="revela" style={atraso(80)}>
                    {p.titulo}
                  </h3>
                  <p className="revela az-passo-descricao" style={atraso(160)}>
                    {p.texto}
                  </p>
                  <ul className="az-lista-verde">
                    {p.itens.map((item, j) => (
                      <li key={item} className="revela" style={atraso(240 + j * 80)}>
                        <span aria-hidden className="az-visto">
                          <Check size={14} strokeWidth={3} />
                        </span>
                        {item}
                      </li>
                    ))}
                  </ul>
                </Revelar>
                <Revelar className={`az-passo-aparelho ${p.tom}`}>
                  <Previa />
                </Revelar>
              </li>
            )
          })}
        </ol>
        <div className="az-centro">
          <LinkDeCadastro origem="tour" className="az-pilula az-pilula-verde az-pilula-grande">
            {trialDias ? `Testar grátis por ${trialDias} dias` : 'Testar grátis'}
          </LinkDeCadastro>
        </div>
      </div>
    </section>
  )
}

function CelulaDoComparativo({ valor, destaque = false }: { valor: Celula; destaque?: boolean }) {
  if (valor === 'sim') {
    return (
      <span className={destaque ? 'az-sim az-sim-destaque' : 'az-sim'}>
        <Check size={14} strokeWidth={3} aria-hidden />
        <span className="sr-only">Sim</span>
      </span>
    )
  }
  if (valor === 'nao') {
    return (
      <span className="az-nao">
        <Minus size={16} strokeWidth={2.5} aria-hidden />
        <span className="sr-only">Não</span>
      </span>
    )
  }
  return <span className="az-parcial">{valor === 'parcial' ? 'Parcial' : 'Manual'}</span>
}

function Comparativo() {
  return (
    <section aria-labelledby="comparativo-titulo" className="az-secao">
      <div className="az-conteiner az-comparativo-grade">
        <TituloDeSecao
          id="comparativo-titulo"
          fino="O que muda em relação"
          forte="ao que você usa hoje"
          apoio="Comparação por tipo de ferramenta, pelos recursos mais comuns em cada uma. Não se refere a nenhum produto específico."
        />
        <div className="az-tabela-caixa">
          <table className="az-tabela">
            <caption className="sr-only">Comparação de recursos entre planilha e Google, monitores comuns e o Monitor de Licitações</caption>
            <thead>
              <tr>
                <th scope="col">Recurso</th>
                <th scope="col">Planilha e Google</th>
                <th scope="col">Monitores comuns</th>
                <th scope="col" className="az-tabela-destaque">
                  Monitor de Licitações
                </th>
              </tr>
            </thead>
            <tbody>
              {COMPARATIVO.map((linha) => (
                <tr key={linha.recurso}>
                  <th scope="row">{linha.recurso}</th>
                  <td>
                    <CelulaDoComparativo valor={linha.planilha} />
                  </td>
                  <td>
                    <CelulaDoComparativo valor={linha.comuns} />
                  </td>
                  <td className="az-tabela-destaque">
                    <CelulaDoComparativo valor={linha.monitor} destaque />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function Confianca({ trialDias }: { trialDias: number | null }) {
  return (
    <section aria-labelledby="confianca-titulo" className="az-confianca">
      <div className="az-conteiner">
        <h2 id="confianca-titulo" className="az-sobretitulo">
          Com quem você está lidando
        </h2>
        <ul className="az-confianca-lista">
          {CONFIANCA.map(({ icone: Icone, titulo, texto }) => (
            <li key={titulo}>
              <span aria-hidden className="az-confianca-icone">
                <Icone size={20} strokeWidth={2.25} />
              </span>
              <span>
                <strong>{titulo}</strong>
                <span>{titulo === 'Teste grátis sem cartão' && trialDias ? `${trialDias} dias para usar o Monitor, sem informar cartão de crédito.` : texto}</span>
              </span>
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}

function Limite({ valor, singular, plural }: { valor: number | null; singular: string; plural: string }) {
  if (valor === null) return <>Sem limite de {plural}</>
  return (
    <>
      <b>{numero(valor)}</b> {valor === 1 ? singular : plural}
    </>
  )
}

function Planos({ dados }: { dados: PlanosResposta }) {
  return (
    <section id="planos" aria-labelledby="planos-titulo" className="az-secao az-secao-branca">
      <div className="az-conteiner">
        <TituloDeSecao
          id="planos-titulo"
          fino="Planos para"
          forte="cada tamanho de empresa"
          apoio="A cobrança ainda não está ativa: durante o teste você usa o plano gratuito, e os preços dos planos pagos serão divulgados em breve."
        />
        <Revelar>
          <ul className="az-planos">
            {dados.planos.map((p, i) => {
              const teste = p.codigo === 'TESTE'
              return (
                <li key={p.codigo} className={`revela az-plano ${teste ? 'az-plano-teste az-escuro' : ''}`} style={atraso(i * 90)}>
                  {teste && <span className="az-plano-selo">Disponível agora</span>}
                  <h3>{p.nome}</h3>
                  {p.descricao && <p className="az-plano-descricao">{p.descricao}</p>}
                  <p className="az-plano-preco">
                    {teste ? (
                      <>
                        Grátis
                        {dados.trialDias > 0 && <small> por {dados.trialDias} dias</small>}
                      </>
                    ) : p.precoMensalCentavos ? (
                      <>
                        {brl(p.precoMensalCentavos)}
                        <small>/mês</small>
                      </>
                    ) : (
                      <span className="az-plano-em-breve">Preço em breve</span>
                    )}
                  </p>
                  <ul className="az-plano-limites">
                    <li>
                      <Check size={16} strokeWidth={3} aria-hidden />
                      <span>
                        <Limite valor={p.limites.itensMonitorados} singular="item monitorado" plural="itens monitorados" />
                      </span>
                    </li>
                    <li>
                      <Check size={16} strokeWidth={3} aria-hidden />
                      <span>
                        <Limite valor={p.limites.usuarios} singular="usuário" plural="usuários" />
                      </span>
                    </li>
                    <li>
                      <Check size={16} strokeWidth={3} aria-hidden />
                      <span>
                        <Limite valor={p.limites.analisesIaMes} singular="análise de edital por mês" plural="análises de edital por mês" />
                      </span>
                    </li>
                  </ul>
                  {teste && (
                    <LinkDeCadastro origem="planos" className="az-pilula az-pilula-verde az-pilula-cheia">
                      Começar o teste
                    </LinkDeCadastro>
                  )}
                </li>
              )
            })}
          </ul>
        </Revelar>
      </div>
    </section>
  )
}

function PerguntasFrequentes({ trialDias }: { trialDias: number | null }) {
  return (
    <section aria-labelledby="perguntas-titulo" className="az-secao">
      <div className="az-conteiner az-perguntas-grade">
        <TituloDeSecao id="perguntas-titulo" fino="Perguntas" forte="frequentes" />
        <div className="az-perguntas">
          {perguntasFrequentes(trialDias).map((item) => (
            <details key={item.pergunta} className="az-pergunta">
              <summary>
                {item.pergunta}
                <span aria-hidden className="az-pergunta-icone">
                  <ChevronDown size={18} strokeWidth={2.5} />
                </span>
              </summary>
              <div className="az-pergunta-resposta">{item.resposta}</div>
            </details>
          ))}
        </div>
      </div>
    </section>
  )
}

function ChamadaFinal({ trialDias, estatisticas, whatsapp }: { trialDias: number | null; estatisticas: EstatisticasPublicas | null; whatsapp: string | null }) {
  return (
    <section id={ID_DO_FIM} aria-labelledby="comece-titulo" className="az-final az-escuro">
      <Aneis variante="final" />
      <div className="az-conteiner az-final-grade">
        <div className="az-final-texto">
          {estatisticas && (
            <p className="az-final-numero">
              <NumeroQueSobe valor={estatisticas.abertas} />
              <span>{estatisticas.abertas === 1 ? 'licitação aberta agora' : 'licitações abertas agora'}</span>
            </p>
          )}
          <h2 id="comece-titulo">
            <span className="az-forte">{estatisticas ? 'Quantas são para o que você vende?' : 'Veja hoje as licitações abertas para o que você vende.'}</span>
          </h2>
          <p className="az-final-apoio">Crie a conta, cadastre os seus itens e veja o que está aberto agora. {trialDias ? `${trialDias} dias grátis, sem cartão de crédito.` : 'Sem cartão de crédito.'}</p>
          <div className="az-final-acoes">
            <LinkDeCadastro origem="final" className="az-pilula az-pilula-verde az-pilula-grande">
              Testar grátis
            </LinkDeCadastro>
            {whatsapp && (
              <LinkDoWhatsApp numero={whatsapp} origem="final" className="az-pilula az-pilula-vazada az-pilula-grande">
                Falar no WhatsApp
                <span className="sr-only"> (abre em nova aba)</span>
              </LinkDoWhatsApp>
            )}
          </div>
          <Link href="/login" className="az-final-entrar">
            Já tenho conta: entrar
          </Link>
        </div>
        <div aria-hidden className="az-final-bela">
          <Image src="/bela/bela-640.webp" alt="" width={640} height={605} sizes="360px" className="az-final-foto" />
          <p className="az-balao az-final-balao">
            <span className="az-balao-autora">Bela</span>
            “Me diga o que você vende. O resto eu procuro.”
          </p>
        </div>
      </div>
    </section>
  )
}

function Rodape() {
  return (
    <footer className="az-rodape">
      <div className="az-conteiner az-rodape-grade">
        <p className="az-marca az-marca-rodape">
          Monitor <span>de Licitações</span>
        </p>
        <p>© Monitor de Licitações · H&amp;M Engenharia e Tecnologia · Brasília/DF</p>
        <nav aria-label="Documentos legais" className="az-rodape-links">
          <Link href="/termos" className="az-link">
            Termos de Uso
          </Link>
          <Link href="/privacidade" className="az-link">
            Política de Privacidade
          </Link>
        </nav>
      </div>
    </footer>
  )
}

export default async function Entrada() {
  const { estatisticas, planos, chegando, totaisPorTermo, primeiroPrazoPorTermo } = await carregarDadosDaEntrada(RAMOS.map((r) => r.termo))
  const trialDias = planos?.trialDias && planos.trialDias > 0 ? planos.trialDias : null
  const whatsapp = numeroDoWhatsApp()

  return (
    <div className={whatsapp ? 'az-pagina az-com-whatsapp' : 'az-pagina'}>
      <EfeitosDaEntrada />
      <main>
      <Heroi
        estatisticas={estatisticas}
        trialDias={trialDias}
        chegando={chegando}
        totalDaBela={totaisPorTermo[TERMO_DA_BELA] ?? null}
        prazoDaBela={primeiroPrazoPorTermo[TERMO_DA_BELA] ?? null}
      />
        <FaixaDeFontes />
        <Ramos totaisPorTermo={totaisPorTermo} />
        <ConhecaABela trialDias={trialDias} />
        <Tour trialDias={trialDias} />
        <Comparativo />
        <Confianca trialDias={trialDias} />
        {planos && planos.planos.length > 0 && <Planos dados={planos} />}
        <PerguntasFrequentes trialDias={trialDias} />
        <ChamadaFinal trialDias={trialDias} estatisticas={estatisticas} whatsapp={whatsapp} />
      </main>
      <Rodape />
      <BarraFixaMovel idDoTopo={ID_DO_TOPO} idDoFim={ID_DO_FIM} rotuloDoCadastro={trialDias ? `Testar grátis por ${trialDias} dias` : 'Testar grátis'} />
      {whatsapp && <BotaoWhatsApp numero={whatsapp} />}
    </div>
  )
}
