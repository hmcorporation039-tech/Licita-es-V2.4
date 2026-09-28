// ============================================================
// services/sescGoParser.ts — Normaliza a listagem HTML do SESC Goiás
// Fonte: www3.sescgo.com.br/licitacoes
// Reconhecimento manual em 2026-09-28: página HTML server-side única
// (sem paginação — todo o histórico numa carga só, ~15 MB), organizada
// em cards por licitação dentro de #licitacoes.accordion.
// Sistema S — TCU já decidiu que o SESC não segue a Lei 14.133, por isso
// não está garantido no PNCP.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender } from '../types'
import { SESCGO_MODALIDADE_MAP } from '../types'
import { parseDataBr } from '../lib/scrapingHelpers'

function truncate(str: string, max = 500): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

export const SESCGO_CNPJ = '03671444000147'
export const SESCGO_RAZAO_SOCIAL = 'Serviço Social do Comércio - SESC - Administração Regional no Estado de Goiás'

export function parseSescGoListagem(html: string): NormalizedTender[] {
  const $ = cheerio.load(html)
  const tenders: NormalizedTender[] = []

  $('#licitacoes.accordion > .card').each((_, card) => {
    const el = $(card)

    // Campos "label / descrição" ficam em pares de spans dentro do card-body —
    // monta um mapa {label: valor} pra não depender da ordem das colunas.
    const campos: Record<string, string> = {}
    el.find('.lista-licitacoes__label').each((__, label) => {
      const chave = $(label).text().replace(/\s+/g, ' ').trim().toLowerCase()
      const valor = $(label).next('.lista-licitacoes__descricao').text().replace(/\s+/g, ' ').trim()
      campos[chave] = valor
    })

    const processo = campos['processo n°'] ?? campos['processo nº']
    if (!processo) return // card fora do padrão esperado — pula em vez de quebrar a coleta inteira

    const objeto = el.find('.card-header .title').first().text().replace(/\s+/g, ' ').trim()
    const modalidadeTexto = (campos['modalidade'] ?? '').toLowerCase()
    const linkEdital = el.find('nav a[href*="/licitacao/download/"]').first().attr('href')

    tenders.push({
      fonte: 'SESC_GO',
      fonteId: `SESCGO-${processo.replace(/\//g, '-')}`,
      modalidade: SESCGO_MODALIDADE_MAP[modalidadeTexto] ?? 'OUTROS',
      objeto,
      objetoResumido: truncate(objeto),
      uf: 'GO',
      orgao: SESCGO_RAZAO_SOCIAL,
      orgaoCnpj: SESCGO_CNPJ,
      encerramentoAt: parseDataBr(campos['abertura']),
      linkEdital,
      numeroControle: processo,
      rawJson: {},
    })
  })

  return tenders
}
