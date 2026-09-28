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

// Licitação encerrada/executada não deve entrar no sistema (mesmo princípio
// em fiegParser.ts, novacapParser.ts, sestSenatParser.ts). Nunca vimos a
// lista completa de valores de "Situação" nesta fonte (só "Disponível" em
// amostra real) — por segurança, a regra é por exclusão dos que reconhecemos
// claramente como estado final, não por uma lista fechada do que é "aberto".
const SITUACAO_FECHADA = /encerrad|cancelad|revogad|anulad|homologad|fracassad|conclu[íi]d|finalizad|suspens|deserta/i

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

    if (SITUACAO_FECHADA.test(campos['situação'] ?? campos['situacao'] ?? '')) return

    const objeto = el.find('.card-header .title').first().text().replace(/\s+/g, ' ').trim()
    const modalidadeTexto = (campos['modalidade'] ?? '').toLowerCase()

    // Anexos (edital + termo de referência + minutas...) — capturados aqui,
    // na coleta, porque essa fonte não tem página de detalhe por licitação
    // pra buscar sob demanda como as outras (é tudo uma página só). Só o
    // link e o nome do arquivo, nada de peso (ver análise de edital por IA).
    const anexos: { uri: string; titulo: string }[] = []
    el.find('nav a[href*="/licitacao/download/"]').each((__, a) => {
      const uri = $(a).attr('href')
      if (!uri) return
      const bruto = $(a).text().replace(/\s+/g, ' ').trim()
      const titulo = bruto.replace(/\s*-\s*\d{2}\/\d{2}\/\d{2}\s+\d{2}:\d{2}\s*$/, '').trim()
      anexos.push({ uri, titulo: titulo || 'Anexo' })
    })

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
      linkEdital: anexos[0]?.uri,
      numeroControle: processo,
      rawJson: { anexos },
    })
  })

  return tenders
}
