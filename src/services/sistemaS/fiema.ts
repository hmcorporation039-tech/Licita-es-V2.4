import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { ContextoDeParse, SITUACAO_FECHADA, limparTexto, truncar, urlAbsoluta } from '../sescRegional/tipos'
import {
  FonteHtmlDoSistemaS,
  aberturaAindaPorVir,
  entidadesDoNome,
  horarioDeBrasilia,
  inicioDoDiaEmBrasilia,
  modalidadeDoSistemaS,
  orgaoDasEntidades,
} from './comum'

export const ORIGEM_DA_FIEMA = 'https://www.fiema.org.br'
export const MAXIMO_DE_PAGINAS_POR_LISTA_DA_FIEMA = 2

const SIGLA_DA_FEDERACAO_MA = 'FIEMA'

const MESES: Record<string, number> = {
  janeiro: 1, fevereiro: 2, marco: 3, abril: 4, maio: 5, junho: 6,
  julho: 7, agosto: 8, setembro: 9, outubro: 10, novembro: 11, dezembro: 12,
}

interface ListaDaFiema {
  id: string
  caminho: string
  modalidade: string
}

export const LISTAS_DA_FIEMA: ListaDaFiema[] = [
  { id: '18', caminho: '/editais/18/RCA+-+Disputa+Aberta', modalidade: 'RCA Disputa Aberta' },
  { id: '19', caminho: '/editais/19/RCA+-+Disputa+Fechada', modalidade: 'RCA Disputa Fechada' },
  { id: '6', caminho: '/editais/6/Credenciamento', modalidade: 'Credenciamento' },
]

interface CartaoDaFiema {
  id: string
  titulo: string
  descricao: string
  link?: string
  publicadoAt?: Date
  inicioAt?: Date
  envelopesAt?: Date
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
}

export function dataPorExtenso(texto: string | null | undefined): Date | undefined {
  const m = semAcento(texto ?? '').match(/(\d{1,2})\s+de\s+([a-z]+)\s+de\s+(\d{4})(?:\s+as\s+(\d{1,2})(?::(\d{2}))?\s*h)?/)
  if (!m || !MESES[m[2]]) return undefined
  return horarioDeBrasilia(Number(m[3]), MESES[m[2]], Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0))
}

function listaDaUrl(url: string): ListaDaFiema | undefined {
  try {
    const id = new URL(url).pathname.match(/^\/editais\/(\d+)(?:\/|$)/)?.[1]
    return LISTAS_DA_FIEMA.find((l) => l.id === id)
  } catch {
    return undefined
  }
}

function trechoDepoisDe(texto: string, rotulo: string): string {
  const inicio = texto.indexOf(rotulo)
  if (inicio < 0) return ''
  const resto = texto.slice(inicio + rotulo.length)
  const fim = resto.search(/Data de [A-ZÀ-Ú]/)
  return (fim < 0 ? resto : resto.slice(0, fim)).trim()
}

export function cartoesDaFiema(html: string, base: string): CartaoDaFiema[] {
  const $ = cheerio.load(html)
  const cartoes: CartaoDaFiema[] = []
  $('#lista-edital [data-key]').each((_, el) => {
    const bloco = $(el)
    const id = bloco.attr('data-key') ?? ''
    if (!/^\d+$/.test(id)) return
    const ancora = bloco.find('a[href^="/edital/"]').first()
    const titulo = limparTexto(ancora.text()) || limparTexto(ancora.attr('title'))
    const paragrafos = bloco.find('p').map((__, p) => limparTexto($(p).text())).get()
    const datas = paragrafos.find((p) => /Data de /.test(p)) ?? ''
    const descricao = paragrafos.filter((p) => p && !/Data de |^Saiba mais!?$/.test(p)).join(' ')
    cartoes.push({
      id,
      titulo,
      descricao,
      link: urlAbsoluta(ancora.attr('href'), base),
      publicadoAt: dataPorExtenso(trechoDepoisDe(datas, 'Data de Publicação:')),
      inicioAt: dataPorExtenso(trechoDepoisDe(datas, 'Data de Início:')),
      envelopesAt: dataPorExtenso(trechoDepoisDe(datas, 'Data de Abertura dos Envelopes:')),
    })
  })
  return cartoes
}

function situacaoNoTitulo(titulo: string): string {
  return titulo.match(/^\s*\(([^)]*)\)/)?.[1] ?? ''
}

export function parseFiema(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const lista = listaDaUrl(ctx.url)
  if (!lista) return []
  const resultado: NormalizedTender[] = []
  for (const cartao of cartoesDaFiema(html, ctx.url)) {
    if (!cartao.titulo || SITUACAO_FECHADA.test(situacaoNoTitulo(cartao.titulo))) continue
    const abertura = cartao.envelopesAt ?? cartao.inicioAt
    if (!aberturaAindaPorVir(abertura, ctx.agora)) continue
    const orgao = orgaoDasEntidades(entidadesDoNome(`${cartao.titulo} ${cartao.descricao}`), 'MA', SIGLA_DA_FEDERACAO_MA)
    if (!orgao) continue
    const objeto = cartao.descricao.length >= 10 ? cartao.descricao : cartao.titulo
    resultado.push({
      fonte: 'SISTEMA_S',
      fonteId: `HTML-MA:${lista.id}:${cartao.id}`,
      modalidade: modalidadeDoSistemaS(lista.modalidade),
      objeto,
      objetoResumido: truncar(cartao.titulo),
      uf: 'MA',
      orgao,
      aberturaAt: abertura,
      publicadoAt: cartao.publicadoAt,
      linkEdital: cartao.link ?? ctx.url,
      numeroControle: cartao.titulo.match(/n[º°o]\s*(\d+\/\d{4})/i)?.[1],
      rawJson: {
        plataforma: 'FIEMA',
        lista: lista.id,
        modalidade: lista.modalidade,
        titulo: cartao.titulo,
        inicio: cartao.inicioAt?.toISOString(),
        aberturaDosEnvelopes: cartao.envelopesAt?.toISOString(),
        anexos: [],
      },
    })
  }
  return resultado
}

export function proximasPaginasDaFiema(html: string, ctx: ContextoDeParse): string[] {
  const pagina = Number(new URL(ctx.url).searchParams.get('page') ?? '1')
  if (!Number.isInteger(pagina) || pagina >= MAXIMO_DE_PAGINAS_POR_LISTA_DA_FIEMA) return []
  const cartoes = cartoesDaFiema(html, ctx.url)
  const ultimo = cartoes[cartoes.length - 1]
  const referencia = ultimo?.envelopesAt ?? ultimo?.inicioAt ?? ultimo?.publicadoAt
  if (!referencia || referencia.getTime() < inicioDoDiaEmBrasilia(ctx.agora).getTime()) return []
  const $ = cheerio.load(html)
  const proxima = urlAbsoluta($('ul.pagination li.next a[href]').first().attr('href'), ctx.url)
  return proxima && listaDaUrl(proxima) === listaDaUrl(ctx.url) ? [proxima] : []
}

export function contarCartoesDaFiema(html: string): number {
  return cartoesDaFiema(html, `${ORIGEM_DA_FIEMA}/`).length
}

export const FONTE_DO_MA: FonteHtmlDoSistemaS = {
  origem: 'HTML-MA',
  contar: contarCartoesDaFiema,
  unidade: {
    uf: 'MA',
    chave: 'FIEMA',
    nome: 'Sistema FIEMA',
    urls: () => LISTAS_DA_FIEMA.map((l) => `${ORIGEM_DA_FIEMA}${l.caminho}`),
    parse: parseFiema,
    proximasPaginas: proximasPaginasDaFiema,
  },
}
