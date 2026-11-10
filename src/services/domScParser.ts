// ============================================================
// DOM/SC — Diário Oficial dos Municípios de Santa Catarina (consórcio CIGA).
//
// O CIGA publica cada faixa de horário do diário como dados abertos: um ZIP com um
// JSON ("autopublicacoes"), em que cada publicação já traz município, entidade,
// categoria, título e o texto extraído do PDF. Não há busca nem raspagem de HTML:
// a Bela lê os arquivos do portal de dados abertos (dados.ciga.sc.gov.br, CKAN).
// O texto passa pelo mesmo parser dos outros diários (queridoDiarioParser).
// ============================================================

import * as cheerio from 'cheerio'
import { unzipSync, strFromU8 } from 'fflate'
import { NormalizedTender } from '../types'
import { municipioDaEntidade, textoComOTituloDoAviso } from './diarioMunicipalParser'
import { GazetaQueridoDiario, OrigemDoDiario, chaveDeBusca, parseDiarioOficial } from './queridoDiarioParser'

export const UF_DOM_SC = 'SC'
export const ORIGEM_DOM_SC: OrigemDoDiario = { fonte: 'DIARIO_MUNICIPAL', prefixo: 'DMSC' }

export interface PublicacaoDoDomSc {
  codigo: string
  titulo: string
  data: string
  municipio: string
  entidade: string
  categoria: string
  link: string
  texto: string
}

// Categorias do DOM/SC em que saem avisos de licitação. "Licitações" também traz
// homologações, resultados e respostas a esclarecimento: o título separa esses (abaixo).
const CATEGORIAS_DE_AVISO = new Set(['LICITACOES', 'EDITAL', 'CHAMADAS PUBLICAS'])

// Atos do fim do processo, ou que não abrem disputa: não viram licitação na Bela.
const TITULO_DE_OUTRO_ATO =
  /\b(HOMOLOGA|ADJUDICA|RESULTADO|RATIFICA|RESPOSTA|ESCLARECIMENTO|IMPUGNACAO|RESCISAO|CONTRATO|ADITIVO|ATA DE REGISTRO|EXTRATO|REVOGA|ANULA|DESERTA|FRACASSAD|JULGAMENTO|RECURSO)/

function texto(valor: unknown): string {
  return typeof valor === 'string' ? valor : valor === null || valor === undefined ? '' : String(valor)
}

export function lerArquivoDoDomSc(json: string): PublicacaoDoDomSc[] {
  const dados = JSON.parse(json) as { autopublicacoes?: unknown }
  if (!Array.isArray(dados.autopublicacoes)) throw new Error('arquivo do DOM/SC sem a lista "autopublicacoes"')
  return dados.autopublicacoes
    .filter((p): p is Record<string, unknown> => typeof p === 'object' && p !== null)
    .map((p) => ({
      codigo: texto(p.codigo),
      titulo: texto(p.titulo).trim(),
      data: texto(p.data),
      municipio: texto(p.municipio).trim(),
      entidade: texto(p.entidade).trim(),
      categoria: texto(p.categoria).trim(),
      link: texto(p.link),
      texto: texto(p.texto),
    }))
    .filter((p) => p.codigo !== '')
}

/** O ZIP do CIGA traz um único JSON; junta todos, se vier mais de um. */
export function lerZipDoDomSc(zip: Uint8Array): PublicacaoDoDomSc[] {
  const arquivos = unzipSync(zip, { filter: (f) => f.name.toLowerCase().endsWith('.json') })
  const nomes = Object.keys(arquivos)
  if (nomes.length === 0) throw new Error('ZIP do DOM/SC sem arquivo .json')
  return nomes.flatMap((nome) => lerArquivoDoDomSc(strFromU8(arquivos[nome])))
}

export type AvaliacaoDaPublicacao = 'aviso' | 'outraCategoria' | 'outroAto'

export function avaliarPublicacaoDoDomSc(p: PublicacaoDoDomSc): AvaliacaoDaPublicacao {
  if (!CATEGORIAS_DE_AVISO.has(chaveDeBusca(p.categoria))) return 'outraCategoria'
  if (TITULO_DE_OUTRO_ATO.test(chaveDeBusca(p.titulo))) return 'outroAto'
  return 'aviso'
}

/** O texto vem como HTML gerado do PDF (Apache Tika): tira o cabeçalho de metadados e as tags. */
export function textoDaPublicacao(html: string): string {
  const comQuebras = html.replace(/<head[\s\S]*?<\/head>/gi, ' ').replace(/<(br|\/p|\/div|\/h\d|\/li|\/tr)\b[^>]*>/gi, '$&\n')
  return cheerio
    .load(comQuebras)
    .root()
    .text()
    .replace(/[ \t\f\v\u00a0]+/g, ' ')
    .replace(/\s*\n\s*/g, '\n')
    .trim()
}

// Texto que não é texto: PDF escaneado ou com fonte embutida sai como lixo binário.
// Nesse caso o parser trabalha só com o título, que ainda dá modalidade e número.
function textoLegivel(t: string): boolean {
  if (t.length < 80) return false
  const letras = t.match(/[a-zà-ú0-9]/gi)?.length ?? 0
  return letras / t.length > 0.6
}

export interface ResultadoDaPublicacao {
  tenders: NormalizedTender[]
  avisos: number
  descartadosPorPncp: number
  semMunicipio: boolean
  textoIlegivel: boolean
}

export function avisosDaPublicacaoDoDomSc(p: PublicacaoDoDomSc, agora: Date = new Date()): ResultadoDaPublicacao {
  // O campo "municipio" traz só o nome da cidade; consórcios vêm com a cidade-sede.
  const municipio =
    (p.municipio ? municipioDaEntidade(`Município de ${p.municipio}`, UF_DOM_SC) : null) ?? municipioDaEntidade(p.entidade, UF_DOM_SC)
  if (!municipio) return { tenders: [], avisos: 0, descartadosPorPncp: 0, semMunicipio: true, textoIlegivel: false }

  const corpo = textoDaPublicacao(p.texto)
  const legivel = textoLegivel(corpo)
  const gazeta: GazetaQueridoDiario = {
    territory_id: municipio.ibge,
    territory_name: municipio.nome,
    state_code: UF_DOM_SC,
    date: p.data.slice(0, 10),
    url: p.link,
    txt_url: null,
    edition: null,
  }

  const resultado = parseDiarioOficial(gazeta, textoComOTituloDoAviso(legivel ? corpo : '', p.titulo), agora, ORIGEM_DOM_SC)
  const tenders = resultado.tenders.map((tender) => ({
    ...tender,
    orgao: tender.orgao ?? p.entidade,
    rawJson: { ...tender.rawJson, codigo: p.codigo, diario: 'DOM/SC', entidade: p.entidade, categoria: p.categoria, titulo: p.titulo },
  }))
  return { tenders, avisos: resultado.avisos, descartadosPorPncp: resultado.descartadosPorPncp, semMunicipio: false, textoIlegivel: !legivel }
}
