import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { ContextoDeParse, SITUACAO_FECHADA, limparTexto, truncar, urlAbsoluta } from '../sescRegional/tipos'
import { AnexoDoSistemaS } from './senac'
import {
  FonteHtmlDoSistemaS,
  aberturaAindaPorVir,
  entidadesDoNome,
  horarioDeBrasilia,
  inicioDoDiaEmBrasilia,
  modalidadeDoSistemaS,
  orgaoDasEntidades,
} from './comum'

export const URL_DA_LISTAGEM_DO_AC = 'https://transparencia.fieac.org/editais_transparencia/'
export const MAXIMO_DE_PAGINAS_DO_AC = 3

const SIGLA_DA_FEDERACAO_AC = 'FIEAC'
const MARCA_DO_CARTAO = '<div class="tab-noticias '
const MARCA_DA_PAGINACAO = '<div class="pagination">'
const FASE_ENCERRADA = /finaliza/i
const AVISO_DE_SUSPENSAO = /suspens|suspes[aã]o/i
const AVISO_DE_RETOMADA = /reabert|retomad|republica/i

interface CartaoDoAc {
  numero: string
  modalidadeTexto: string
  entidade: string
  fase: string
  abertura?: Date
  objeto: string
  anexos: AnexoDoSistemaS[]
}

function semAcento(texto: string): string {
  return texto.normalize('NFD').replace(/[̀-ͯ]/g, '')
}

function chaveDaModalidade(texto: string): string {
  return semAcento(texto).toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '')
}

export function aberturaDoAc(texto: string): Date | undefined {
  const m = texto.match(/(\d{2})\/(\d{2})\/(\d{4})(?:\s*-\s*(\d{2}):(\d{2}))?/)
  if (!m) return undefined
  return horarioDeBrasilia(Number(m[3]), Number(m[2]), Number(m[1]), Number(m[4] ?? 0), Number(m[5] ?? 0))
}

function lerCartao(trecho: string, base: string): CartaoDoAc | undefined {
  const $ = cheerio.load(trecho)
  const cabecalho = limparTexto($('.numero').first().text())
  const [, numero, modalidadeTexto] = cabecalho.match(/N[úu]mero:\s*(\d+\/\d{4})\s*\|\s*Modalidade:\s*(.+)$/i) ?? []
  if (!numero) return undefined
  const paragrafos = $('p').map((_, p) => limparTexto($(p).text())).get()
  const valorDe = (rotulo: RegExp) => paragrafos.map((p) => p.match(rotulo)?.[1]).find((v) => v !== undefined)?.trim() ?? ''
  const anexos: AnexoDoSistemaS[] = []
  $('a[href]').each((_, a) => {
    const uri = urlAbsoluta($(a).attr('href'), base)
    if (uri && /\.pdf$/i.test(new URL(uri).pathname)) anexos.push({ uri, titulo: limparTexto($(a).text()) || 'Documento' })
  })
  return {
    numero,
    modalidadeTexto: limparTexto(modalidadeTexto),
    entidade: valorDe(/^Entidade Contratante:\s*(.*)$/i),
    fase: valorDe(/^Fase:\s*(.*)$/i),
    abertura: aberturaDoAc(valorDe(/^Abertura:\s*(.*)$/i)),
    objeto: valorDe(/^Objeto:\s*(.*)$/i),
    anexos,
  }
}

export function cartoesDoAc(html: string, base = URL_DA_LISTAGEM_DO_AC): CartaoDoAc[] {
  return html
    .split(MARCA_DO_CARTAO)
    .slice(1)
    .map((trecho) => lerCartao(MARCA_DO_CARTAO + trecho.split(MARCA_DA_PAGINACAO)[0], base))
    .filter((c): c is CartaoDoAc => c !== undefined)
}

function suspensa(anexos: AnexoDoSistemaS[]): boolean {
  return anexos.some((a) => AVISO_DE_SUSPENSAO.test(a.titulo)) && !anexos.some((a) => AVISO_DE_RETOMADA.test(a.titulo))
}

export function parseFieac(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const resultado: NormalizedTender[] = []
  for (const cartao of cartoesDoAc(html, ctx.url)) {
    if (SITUACAO_FECHADA.test(cartao.fase) || FASE_ENCERRADA.test(cartao.fase)) continue
    if (!aberturaAindaPorVir(cartao.abertura, ctx.agora)) continue
    if (!cartao.objeto || suspensa(cartao.anexos)) continue
    const entidades = entidadesDoNome(cartao.entidade, SIGLA_DA_FEDERACAO_AC)
    const orgao = orgaoDasEntidades(entidades, 'AC', SIGLA_DA_FEDERACAO_AC)
    if (!orgao) continue
    const edital = cartao.anexos.find((a) => /edital/i.test(a.titulo)) ?? cartao.anexos[0]
    resultado.push({
      fonte: 'SISTEMA_S',
      fonteId: `HTML-AC:${entidades.join('-')}:${chaveDaModalidade(cartao.modalidadeTexto)}:${cartao.numero}`,
      modalidade: modalidadeDoSistemaS(cartao.modalidadeTexto),
      objeto: cartao.objeto,
      objetoResumido: truncar(cartao.objeto),
      uf: 'AC',
      orgao,
      unidade: cartao.entidade || undefined,
      aberturaAt: cartao.abertura,
      linkEdital: edital?.uri ?? URL_DA_LISTAGEM_DO_AC,
      numeroControle: cartao.numero,
      rawJson: {
        plataforma: 'FIEAC',
        modalidade: cartao.modalidadeTexto,
        fase: cartao.fase,
        entidade: cartao.entidade,
        anexos: cartao.anexos,
      },
    })
  }
  return resultado
}

function numeroDaPagina(url: string): number {
  try {
    const n = Number(new URL(url).searchParams.get('pagina') ?? '1')
    return Number.isInteger(n) && n > 0 ? n : 1
  } catch {
    return 1
  }
}

export function proximasPaginasDoAc(html: string, ctx: ContextoDeParse): string[] {
  const atual = numeroDaPagina(ctx.url)
  if (atual >= MAXIMO_DE_PAGINAS_DO_AC) return []
  const cartoes = cartoesDoAc(html, ctx.url)
  const ultima = cartoes[cartoes.length - 1]?.abertura
  if (!ultima || ultima.getTime() < inicioDoDiaEmBrasilia(ctx.agora).getTime()) return []
  const $ = cheerio.load(html)
  const href = $('.pagination a[href]')
    .map((_, a) => $(a).attr('href'))
    .get()
    .find((h) => numeroDaPagina(urlAbsoluta(h, ctx.url) ?? '') === atual + 1)
  const proxima = urlAbsoluta(href, ctx.url)
  return proxima ? [proxima] : []
}

export function contarCartoesDoAc(html: string): number {
  return cartoesDoAc(html).length
}

export const FONTE_DO_AC: FonteHtmlDoSistemaS = {
  origem: 'HTML-AC',
  contar: contarCartoesDoAc,
  unidade: {
    uf: 'AC',
    chave: 'FIEAC',
    nome: 'Sistema FIEAC',
    urls: () => [URL_DA_LISTAGEM_DO_AC],
    parse: parseFieac,
    proximasPaginas: proximasPaginasDoAc,
  },
}
