// ============================================================
// services/sescRegional/ro.ts — Sesc Rondônia
// A planilha aponta para https://sescro.com.br/licitacoes/, que é só um índice
// (HTML estático, sem lista). A lista real está em páginas por modalidade
// (WordPress, HTML renderizado no servidor):
//   /licitacoes/editais-pregao-presencial/<ano>-2/   (uma página por ano)
//   /licitacoes/pregao-eletronico/  /licitacoes/convite/
//   /licitacoes/credenciamento/     /licitacoes/concorrencia/
// Cada licitação é uma <table><tbody><tr><td> com o título em <strong>
// ("Edital do Pregão Eletrônico n°0023/26 – PGE – ... Publicado em: 28/09/2026
// – Aberto") seguido dos anexos (links do SharePoint). NÃO há data de sessão:
// só publicação + situação, e há itens antigos ainda "Aberto". Por isso "atual"
// = situação não final E publicada recentemente (credenciamento, que fica aberto
// por meses, usa janela de 1 ano). Chamamentos públicos não trazem data: ignorados.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../../types'
import { parseDataBr } from '../../lib/scrapingHelpers'
import {
  ContextoDeParse,
  SescUnidade,
  detectarModalidade,
  ehLicitacaoAtual,
  limparTexto,
  montarTender,
  publicadaRecentemente,
  urlAbsoluta,
} from './tipos'

const BASE = 'https://sescro.com.br/licitacoes'
const JANELA_CREDENCIAMENTO_DIAS = 365

function urls(agora: Date): string[] {
  const ano = agora.getFullYear()
  const anos = agora.getMonth() <= 1 ? [ano, ano - 1] : [ano]
  return [
    ...anos.map((a) => `${BASE}/editais-pregao-presencial/${a}-2/`),
    `${BASE}/pregao-eletronico/`,
    `${BASE}/convite/`,
    `${BASE}/credenciamento/`,
    `${BASE}/concorrencia/`,
  ]
}

function recente(modalidade: string, publicadoAt: Date | undefined, agora: Date): boolean {
  if (modalidade !== 'CREDENCIAMENTO') return publicadaRecentemente(publicadoAt, agora)
  if (!publicadoAt) return false
  return publicadoAt.getTime() >= agora.getTime() - JANELA_CREDENCIAMENTO_DIAS * 86400000
}

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('td').each((_, el) => {
    const td = $(el)
    if (td.find('td').length) return
    const texto = limparTexto(td.text())
    const m = /publicad[oa] em:?\s*(\d{2}\/\d{2}\/\d{4})\s*[–-]?\s*(\p{L}+)?/iu.exec(texto)
    if (!m) return
    const publicadoAt = parseDataBr(m[1])
    const situacao = m[2] ?? ''

    const titulo = limparTexto(texto.slice(0, m.index).replace(/[\s|–-]+l?[\s|–-]*$/, '').replace(/[\s|–-]+$/, ''))
    if (!titulo) return

    const anexos: { uri: string; titulo: string }[] = []
    td.find('a').each((__, a) => {
      const uri = urlAbsoluta($(a).attr('href'), ctx.url)
      const t = limparTexto($(a).text())
      if (uri && t) anexos.push({ uri, titulo: t })
    })

    const modalidade = detectarModalidade(titulo)
    if (!ehLicitacaoAtual({ situacao }, ctx.agora)) return
    // "Aberto" não é confiável (o portal deixa processos antigos assim): anexo
    // de encerramento também conta como processo finalizado.
    if (anexos.some((a) => /relat[óo]rio de encerramento|homologa/i.test(a.titulo))) return
    if (!recente(modalidade, publicadoAt, ctx.agora)) return

    const num = /(\d{1,5})\s*\/\s*(\d{2,4})\s*[-–]?\s*([A-Z]{2,6})?/.exec(titulo)
    const sigla = num?.[3] ?? ''
    const numeroControle = num ? `${num[1]}/${num[2]}${sigla ? '-' + sigla : ''}` : undefined
    const idLocal = numeroControle ? `${modalidade}-${numeroControle}` : `${modalidade}-${titulo.slice(0, 60)}`
    if (vistos.has(idLocal)) return
    vistos.add(idLocal)

    resultado.push(
      montarTender(sescRO, {
        idLocal,
        objeto: titulo.replace(/^Edital\s+(do|de)\s+/i, ''),
        modalidade,
        numeroControle,
        publicadoAt,
        linkEdital: anexos.find((a) => /edital/i.test(a.titulo))?.uri ?? anexos[0]?.uri,
        anexos,
      })
    )
  })

  return resultado
}

export const sescRO: SescUnidade = {
  uf: 'RO',
  nome: 'Sesc Rondônia',
  urls,
  parse,
}
