// ============================================================
// services/sescRegional/pb.ts — Sesc Paraíba
// A planilha traz só a home (https://www.sescpb.com.br). A lista está no Portal
// da Transparência (https://www.sescpb.com.br/transparencia/#/licitacoes), uma
// SPA AngularJS que carrega o parcial HTML (renderizado no servidor, sem
// login/captcha) https://www.sescpb.com.br/transparencia/partials/licitacoes.php.
// Estrutura do parcial: uma aba (.tab-pane) por modalidade (Dispensa, Convite,
// Concorrência, Inexigibilidade, Concurso, Leilão, Pregão); em cada uma, painéis
// por situação (Em Andamento, Concluida, Deserta, Frustrada, Cancelado...) com
// tabela #Número | Natureza/Objeto | Abertura/Horário. O número e os anexos ficam
// em <a data-numero data-arquivos="...HTML..."> (links mostrar_arquivo.php?id=N,
// relativos a /transparencia/). O parcial traz TODO o histórico; "Em Andamento"
// também guarda processos antigos, então vale a data de abertura.
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
  urlAbsoluta,
} from './tipos'

const BASE_PORTAL = 'https://www.sescpb.com.br/transparencia/'
const LISTA = `${BASE_PORTAL}partials/licitacoes.php`

function parse(html: string, ctx: ContextoDeParse): NormalizedTender[] {
  const $ = cheerio.load(html)
  const resultado: NormalizedTender[] = []
  const vistos = new Set<string>()

  $('.tab-pane').each((_, pane) => {
    const paneId = $(pane).attr('id') ?? ''
    // Nome da modalidade = texto da aba que aponta para este painel.
    const modalidadeTexto = limparTexto(
      $('.nav-tabs a')
        .filter((__, a) => $(a).attr('href') === `#${paneId}`)
        .first()
        .text()
    )

    $(pane)
      .find('.panel')
      .each((__, painel) => {
        const situacao = limparTexto($(painel).find('.panel-title').first().text())
        if (!/andamento/i.test(situacao)) return

        $(painel)
          .find('tbody > tr.rc')
          .each((___, tr) => {
            const tds = $(tr).children('td')
            const a = tds.eq(0).find('a[data-numero]').first()
            const numero = limparTexto(a.attr('data-numero'))
            const objeto = limparTexto(tds.eq(1).text())
            if (!numero || !objeto) return

            const aberturaAt = parseDataBr(tds.eq(2).text())
            if (!ehLicitacaoAtual({ situacao, aberturaAt }, ctx.agora)) return

            const id = `${(modalidadeTexto || paneId).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()}-${numero}`
            if (vistos.has(id)) return
            vistos.add(id)

            const anexos: { uri: string; titulo: string }[] = []
            const arquivos = cheerio.load(a.attr('data-arquivos') ?? '')
            arquivos('a[href]').each((____, l) => {
              const uri = urlAbsoluta(arquivos(l).attr('href'), BASE_PORTAL)
              if (uri) anexos.push({ uri, titulo: limparTexto(arquivos(l).text()) || 'Anexo' })
            })

            resultado.push(
              montarTender(sescPB, {
                idLocal: id,
                objeto,
                modalidade: detectarModalidade(modalidadeTexto || objeto),
                numeroControle: numero,
                aberturaAt,
                linkEdital: anexos[0]?.uri ?? `${BASE_PORTAL}#/licitacoes`,
                anexos,
              })
            )
          })
      })
  })

  return resultado
}

export const sescPB: SescUnidade = {
  uf: 'PB',
  nome: 'Sesc Paraíba',
  urls: () => [LISTA],
  parse,
}
