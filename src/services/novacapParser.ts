// ============================================================
// services/novacapParser.ts — Normaliza a listagem HTML da Novacap
// Fonte: app.novacap.df.gov.br/sislicitapublica/licitalisting/{id}
// Reconhecimento manual do site em 2026-09-28 (ver NOVACAP_LISTAGENS
// em types/index.ts) — não é API, é tabela HTML server-side, uma
// sub-listagem por modalidade, sem paginação dentro de cada uma.
// ============================================================

import * as cheerio from 'cheerio'
import { NormalizedTender, ModalidadeEnum } from '../types'
import { parseDataBr, parseValorBr } from '../lib/scrapingHelpers'
import { novacapClient } from '../lib/httpClient'

function truncate(str: string, max = 500): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// Empresa pública do DF (Lei 13.303/2016) — não segue a Lei 14.133, por
// isso não está garantido no PNCP (ver análise de viabilidade, Etapa 4).
export const NOVACAP_CNPJ = '00037457000170'
export const NOVACAP_RAZAO_SOCIAL = 'Companhia Urbanizadora da Nova Capital do Brasil - NOVACAP'

// Recebe o HTML de UMA sub-listagem (já vem filtrada por modalidade — a
// própria URL/id da listagem decide isso, não tem coluna de modalidade
// na tabela) e devolve as licitações daquela página.
export function parseNovacapListagem(html: string, modalidade: ModalidadeEnum): NormalizedTender[] {
  const $ = cheerio.load(html)
  const tenders: NormalizedTender[] = []

  $('#tblicita tbody tr').each((_, tr) => {
    const row = $(tr)
    const link = row.find('td[data-title="Número/ano"] a')
    const href = link.attr('href') ?? ''
    const idMatch = href.match(/licitadetail\/(\d+)/)
    if (!idMatch) return // linha fora do padrão esperado — pula em vez de quebrar a coleta inteira

    const numero = link.text().replace(/\s+/g, ' ').trim()
    const objeto = row.find('td[data-title="Descrição/objeto"]').text().replace(/\s+/g, ' ').trim()
    const dataHora = row.find('td[data-title="Data-hora"]').text().trim()
    const custo = row.find('td[data-title="Custo estimado"]').text().trim()

    tenders.push({
      fonte: 'NOVACAP',
      fonteId: `NOVACAP-${idMatch[1]}`,
      modalidade,
      objeto,
      objetoResumido: truncate(objeto),
      valorEstimado: parseValorBr(custo),
      uf: 'DF',
      orgao: NOVACAP_RAZAO_SOCIAL,
      orgaoCnpj: NOVACAP_CNPJ,
      // "Data/hora de certame" é a sessão/prazo — mesmo papel que
      // dataEncerramentoProposta tem nos outros parsers (ver comprasnetParser.ts).
      encerramentoAt: parseDataBr(dataHora),
      linkEdital: href,
      numeroControle: numero || undefined,
      rawJson: {},
    })
  })

  return tenders
}

// Busca os anexos (edital, termo de referência, minutas...) de UMA licitação —
// sob demanda, na hora da análise por IA, mesmo padrão do listPNCPDocuments
// (não fica guardado no banco). Aceita o id numérico do licitadetail (extraído
// do fonteId "NOVACAP-{id}").
export async function listNovacapDocumentos(detailId: string): Promise<{ uri: string; titulo: string }[]> {
  const response = await novacapClient.get(`/licitadetail/${detailId}`)
  const $ = cheerio.load(response.data)
  const docs: { uri: string; titulo: string }[] = []

  $('a[href*="/licita/download/"]').each((_, a) => {
    const uri = $(a).attr('href')
    if (!uri) return
    const titulo = $(a).closest('tr').find('td').eq(1).text().replace(/\s+/g, ' ').trim()
    docs.push({ uri, titulo: titulo || 'Anexo' })
  })

  return docs
}
