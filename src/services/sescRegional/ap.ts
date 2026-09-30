// ============================================================
// services/sescRegional/ap.ts — Sesc Amapá
// Fonte: https://www.sescamapa.com.br/licitacoes (achada no menu
// "Licitações" da home; site PHP próprio, HTML no servidor). Mais recentes
// primeiro, 20 por página (/licitacoes/2...). Cada item é um
// `blockquote.blockquote-primary` com: "Publica em: dd/mm/aaaa", "Situação:"
// (Aguradando Abertura [sic] | Homologada...), h4 com o objeto, texto do aviso
// (traz o nº "PREGÃO SESC/DR/AP 000011-26-PG") e botão para a página da
// licitação (/licitacao/<modalidade>/<slug>). A data da disputa e os anexos
// só existem na página de detalhe; a listagem tem só a data de publicação.
// Como o portal mantém como "Aguradando Abertura" processos antigos, vale
// também a recência da publicação (janela de 60 dias).
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

const BASE = 'https://www.sescamapa.com.br/licitacoes'

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('blockquote.blockquote-primary').each((_, el) => {
    const bq = $(el)
    const objeto = limparTexto(bq.find('h4').first().text())
    const link = urlAbsoluta(bq.find('a[href*="/licitacao/"]').first().attr('href'), ctx.url)
    if (!objeto || !link) return

    const meta = limparTexto(bq.find('.post-meta').text())
    const publicadoAt = parseDataBr(meta.match(/Publica em:\s*(\d{2}\/\d{2}\/\d{4})/)?.[1])
    const situacao = meta.match(/Situa[cç][aã]o:\s*(.+)$/)?.[1] ?? ''

    if (!ehLicitacaoAtual({ situacao }, ctx.agora)) return
    if (!publicadaRecentemente(publicadoAt, ctx.agora)) return

    // /licitacao/<modalidade>/<slug>
    const partes = new URL(link).pathname.split('/').filter(Boolean)
    const slug = partes[partes.length - 1]
    if (!slug || vistos.has(slug)) return
    vistos.add(slug)

    const texto = limparTexto(bq.find('.post-content').text())
    const numero = texto.match(/(\d{6}-\d{2})\s*-?\s*([A-Z]{2})\b/)
    resultado.push(
      montarTender(sescAP, {
        idLocal: slug.slice(0, 90),
        objeto,
        modalidade: detectarModalidade(`${partes[1] ?? ''} ${texto}`),
        numeroControle: numero ? `${numero[1]}-${numero[2]}` : undefined,
        publicadoAt,
        linkEdital: link,
      })
    )
  })

  return resultado
}

export const sescAP: SescUnidade = {
  uf: 'AP',
  nome: 'Sesc Amapá',
  urls: () => [BASE],
  parse,
}
