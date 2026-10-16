import { NormalizedTender } from '../../types'
import { SITUACAO_FECHADA, limparTexto, truncar } from '../sescRegional/tipos'
import { AnexoDoSistemaS } from './senac'
import { aberturaAindaPorVir, dataDoPortal, entidadesDoNome, modalidadeDoSistemaS, orgaoDasEntidades, urlHttp } from './comum'

export const MAXIMO_DE_PAGINAS_DA_INDUSTRIA = 20
export const CAMINHO_DA_API_DA_INDUSTRIA = '/api/licitacoes/?status=A&current=1'

export interface PortalDaIndustria {
  chave: string
  uf: string
  sigla: string
  origem: string
  pagina?: string
}

export const PORTAIS_DA_INDUSTRIA: PortalDaIndustria[] = [
  { chave: 'AL', uf: 'AL', sigla: 'FIEA', origem: 'https://licitacao.fiea.com.br' },
  { chave: 'AM', uf: 'AM', sigla: 'FIEAM', origem: 'https://licitacoes.fieam.com.br' },
  { chave: 'AP', uf: 'AP', sigla: 'FIEAP', origem: 'https://licitacao.sesisenaiap.org.br' },
  { chave: 'DF', uf: 'DF', sigla: 'FIBRA', origem: 'https://licitacoes.sistemafibra.org.br' },
  { chave: 'PA', uf: 'PA', sigla: 'FIEPA', origem: 'https://licitacao.senaipa.org.br' },
  { chave: 'PB', uf: 'PB', sigla: 'FIEPB', origem: 'https://licitacoes.fiepb.org.br' },
  { chave: 'PE', uf: 'PE', sigla: 'FIEPE', origem: 'https://licitacoes.pe.senai.br' },
  { chave: 'PI', uf: 'PI', sigla: 'FIEPI', origem: 'https://licitacao.fiepi.com.br' },
  { chave: 'RO', uf: 'RO', sigla: 'FIERO', origem: 'https://licitacao.fiero.org.br' },
  { chave: 'RR', uf: 'RR', sigla: 'FIER', origem: 'http://licitacoes.rr.senai.br:8000' },
  { chave: 'SE', uf: 'SE', sigla: 'FIES', origem: 'https://lsa.fies.org.br' },
  { chave: 'TO', uf: 'TO', sigla: 'FIETO', origem: 'http://licitacao.sesi-to.com.br' },
  { chave: 'DN', uf: 'DF', sigla: 'CNI', origem: 'https://www.portaldaindustria.com.br', pagina: 'https://www.portaldaindustria.com.br/licitacoes/' },
]

interface DocumentoDaIndustria {
  descricao?: string | null
  arquivo?: string | null
  tipo?: string | null
}

interface LicitacaoDaIndustria {
  id?: number | null
  numero?: number | string | null
  ano?: number | string | null
  titulo?: string | null
  objeto?: string | null
  modalidade?: string | null
  data_abertura?: string | null
  status?: string | null
  empresas?: { nome?: string | null }[] | null
  documentos?: DocumentoDaIndustria[] | null
  criterios_julgamento?: string | null
}

export interface PaginaDaIndustria {
  count?: number
  next?: string | null
  results?: LicitacaoDaIndustria[] | null
}

export function urlDaPrimeiraPagina(portal: PortalDaIndustria): string {
  return `${portal.origem}${CAMINHO_DA_API_DA_INDUSTRIA}`
}

export function lerPaginaDaIndustria(texto: string): PaginaDaIndustria {
  let pagina: PaginaDaIndustria
  try {
    pagina = JSON.parse(texto) as PaginaDaIndustria
  } catch {
    throw new Error('Portal da Indústria: resposta não é JSON válido')
  }
  if (!pagina || !Array.isArray(pagina.results)) throw new Error('Portal da Indústria: resposta sem a lista de licitações')
  return pagina
}

function semWww(host: string): string {
  return host.toLowerCase().replace(/^www\./, '')
}

export function proximaPaginaDaIndustria(pagina: PaginaDaIndustria, portal: PortalDaIndustria): string | undefined {
  if (!pagina.next) return undefined
  try {
    const proxima = new URL(pagina.next)
    const origem = new URL(portal.origem)
    if (semWww(proxima.hostname) !== semWww(origem.hostname)) return undefined
    if (!proxima.pathname.startsWith('/api/licitacoes')) return undefined
    return `${portal.origem}${proxima.pathname}${proxima.search}`
  } catch {
    return undefined
  }
}

function objetoDaLicitacao(licitacao: LicitacaoDaIndustria): string {
  const objeto = limparTexto(licitacao.objeto)
  const rotulado = objeto.match(/\bobjeto\s*:\s*(.+)$/i)?.[1]
  if (rotulado && limparTexto(rotulado).length >= 10) return limparTexto(rotulado)
  return objeto || limparTexto(licitacao.titulo)
}

function urlDoArquivo(arquivo: string | null | undefined, portal: PortalDaIndustria): string | undefined {
  const caminho = (arquivo ?? '').trim()
  if (caminho.startsWith('/') && !caminho.startsWith('//')) return urlHttp(`${portal.origem}${caminho}`)
  return urlHttp(caminho)
}

function anexosDaLicitacao(licitacao: LicitacaoDaIndustria, portal: PortalDaIndustria): AnexoDoSistemaS[] {
  const anexos: AnexoDoSistemaS[] = []
  for (const doc of licitacao.documentos ?? []) {
    const uri = urlDoArquivo(doc.arquivo, portal)
    if (!uri) continue
    const titulo = [limparTexto(doc.tipo), limparTexto(doc.descricao)].filter(Boolean).join(' - ')
    anexos.push({ uri, titulo: titulo || 'Documento' })
  }
  return anexos
}

function linkDoEdital(anexos: AnexoDoSistemaS[], portal: PortalDaIndustria): string {
  const principal =
    anexos.find((a) => /edital|chamamento/i.test(a.titulo) && /\.pdf(\?|$)/i.test(a.uri)) ??
    anexos.find((a) => /edital|chamamento/i.test(a.titulo)) ??
    anexos[0]
  return principal?.uri ?? portal.pagina ?? `${portal.origem}/`
}

function numeroDaLicitacao(licitacao: LicitacaoDaIndustria): string | undefined {
  const numero = limparTexto(String(licitacao.numero ?? ''))
  if (!numero) return undefined
  const ano = limparTexto(String(licitacao.ano ?? ''))
  return ano && !numero.includes('/') ? `${numero}/${ano}` : numero
}

export function parseLicitacoesDaIndustria(pagina: PaginaDaIndustria, portal: PortalDaIndustria, agora: Date): NormalizedTender[] {
  const resultado: NormalizedTender[] = []
  for (const licitacao of pagina.results ?? []) {
    if (!Number.isInteger(licitacao.id)) continue
    const objeto = objetoDaLicitacao(licitacao)
    if (!objeto) continue
    const status = limparTexto(licitacao.status)
    if (status && SITUACAO_FECHADA.test(status)) continue
    const abertura = dataDoPortal(licitacao.data_abertura)
    if (!aberturaAindaPorVir(abertura, agora)) continue

    const empresas = (licitacao.empresas ?? []).map((e) => limparTexto(e.nome)).filter(Boolean)
    const orgao = orgaoDasEntidades(entidadesDoNome(empresas.join(' / '), portal.sigla), portal.chave, portal.sigla)
    if (!orgao) continue

    const anexos = anexosDaLicitacao(licitacao, portal)
    const modalidade = limparTexto(licitacao.modalidade)
    resultado.push({
      fonte: 'SISTEMA_S',
      fonteId: `IND-${portal.chave}:${licitacao.id}`,
      modalidade: modalidadeDoSistemaS(modalidade),
      objeto,
      objetoResumido: truncar(objeto),
      uf: portal.uf,
      orgao,
      unidade: empresas.join(' / ') || undefined,
      aberturaAt: abertura,
      linkEdital: linkDoEdital(anexos, portal),
      numeroControle: numeroDaLicitacao(licitacao),
      rawJson: {
        plataforma: 'PORTAL_DA_INDUSTRIA',
        portal: portal.chave,
        titulo: limparTexto(licitacao.titulo) || undefined,
        modalidade,
        status,
        criterioDeJulgamento: limparTexto(licitacao.criterios_julgamento) || undefined,
        empresas,
        anexos,
      },
    })
  }
  return resultado
}
