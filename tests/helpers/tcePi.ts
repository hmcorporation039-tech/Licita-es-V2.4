import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { strToU8, zipSync } from 'fflate'
import type { CamposDoFormulario } from '../../src/services/tcePiParser'
import type { RedeDoTcePi, RespostaDoTcePi } from '../../src/services/tcePiColeta'

export const PASTA_DO_TCE_PI = join(__dirname, '..', 'fixtures', 'tce-pi')
export const TABELA = 'formListaLic:listaLic'

export function paginaDoTcePi(nome: string): string {
  return readFileSync(join(PASTA_DO_TCE_PI, nome), 'utf8')
}

export interface LinhaFalsaTcePi {
  id: number
  orgao?: string
  esfera?: string
  controle?: string
  procedimento?: string
  processo?: string
  modalidade?: string
  forma?: string
  objeto?: string
  abertura?: string
  valor?: string
  status?: string
  publicacao?: string
  cadastro?: string
  atualizacao?: string
}

function valores(l: LinhaFalsaTcePi): string[] {
  return [
    l.orgao ?? 'P. M. DE PAJEU DO PIAUI',
    l.esfera ?? 'MUNICIPAL',
    l.controle ?? `LW-${l.id}/26`,
    l.procedimento ?? `Pregão nº ${l.id % 1000}/2026`,
    'Lei nº 14.133/21',
    l.modalidade ?? 'Pregão',
    l.forma ?? 'Eletrônica',
    'Menor preço',
    'Serviços',
    l.objeto ?? `Aquisição de material número ${l.id}`,
    l.abertura ?? '05/11/2026 09:00',
    (l.abertura ?? '05/11/2026 09:00').slice(0, 10),
    l.valor ?? '1.000,0000',
    `R$ ${l.valor ?? '1.000,00'}`,
    l.status ?? 'Divulgada',
    l.publicacao ?? '01/10/2026',
    '',
    '',
    '',
    l.cadastro ?? '01/10/2026',
    l.atualizacao ?? '01/10/2026',
    `http://sistemas.tce.pi.gov.br/muralic/detalhelicitacao.xhtml?id=${l.id}`,
    '',
  ]
}

export function linhasFalsas(linhas: LinhaFalsaTcePi[], primeira = 0): string {
  return linhas
    .map((l, i) => {
      const celulas = valores(l).map((v, coluna) =>
        coluna === 3 ? `<td role="gridcell"><span title="${l.controle ?? `LW-${l.id}/26`}  -  proc. admin. ${l.processo ?? `${l.id}/2026`}">${v}</span></td>` : `<td role="gridcell">${v}</td>`
      )
      return `<tr data-ri="${primeira + i}" class="ui-widget-content" role="row">${celulas.join('')}</tr>`
    })
    .join('')
}

export function respostaParcial(atualizacoes: Record<string, string>, viewState = 'vs-novo', avaliacoes: string[] = []): string {
  const partes = Object.entries(atualizacoes).map(([id, html]) => `<update id="${id}"><![CDATA[${html}]]></update>`)
  partes.push(`<update id="j_id1:javax.faces.ViewState:0"><![CDATA[${viewState}]]></update>`)
  for (const a of avaliacoes) partes.push(`<eval><![CDATA[${a}]]></eval>`)
  return `<?xml version='1.0' encoding='UTF-8'?>\n<partial-response><changes>${partes.join('')}</changes></partial-response>`
}

export function pesquisaFalsa(total: number, viewState = 'vs-pesquisa'): string {
  const real = paginaDoTcePi('pesquisa-divulgadas.xml')
  const tabela = real.match(/<update id="formListaLic:listaLic"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1] ?? ''
  return respostaParcial({ [TABELA]: tabela.replace(/rowCount:\d+/, `rowCount:${total}`) }, viewState)
}

const CABECALHO_DA_PLANILHA = [
  'Órgão', 'Esfera', 'Nº proc. TCE', 'Nº Procedimento', 'Regime Jurídico', 'Modalidade', 'Forma Realização', 'Critério Julg.', 'Tipo Objeto', 'Objeto',
  'Dt Abert/Julg', 'Valor', 'Status', 'Dt Últ. Public.', 'Dt Adjudicação', 'Dt Homologação', 'Dt Finalização', 'Dt Cadastro', 'Dt Últ. Atualização', 'Caminho detalhamento licitação',
]

function celula(coluna: number, linha: number, texto: string): string {
  return `<c r="${String.fromCharCode(65 + coluna)}${linha}" t="inlineStr"><is><t>${texto}</t></is></c>`
}

export function exportacaoFalsa(linhas: LinhaFalsaTcePi[]): string {
  const corpo = linhas.map((l) => {
    const v = valores(l)
    return [v[0], v[1], v[2], v[3], v[4], v[5], v[6], v[7], v[8], v[9], v[10], v[12], v[14], v[15], '', '', '', v[19], v[20], v[21]]
  })
  const linhasXml = [CABECALHO_DA_PLANILHA, ...corpo].map((r, i) => `<row r="${i + 1}">${r.map((t, c) => celula(c, i + 1, t)).join('')}</row>`).join('')
  const folha = `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData>${linhasXml}</sheetData></worksheet>`
  const xlsx = zipSync({ 'xl/worksheets/sheet1.xml': strToU8(folha) })
  const base64 = Buffer.from(xlsx).toString('base64')
  return respostaParcial({}, 'vs-exportacao', [`PrimeFaces.download('data:application/vnd.openxmlformats-officedocument.spreadsheetml.sheet;base64,${base64}', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'licitações.xlsx', 'primefaces.download_index.xhtml');`])
}

export function detalheFalso(status: string): string {
  return paginaDoTcePi('detalhe-suspensa-1175015.html').replace('>SUSPENSA</label>', `>${status}</label>`)
}

export function publicacoesFalsas(meios: string[]): string {
  const real = paginaDoTcePi('publicacoes-1175365.xml')
  const painel = real.match(/<update id="j_idt162"><!\[CDATA\[([\s\S]*?)\]\]><\/update>/)?.[1] ?? ''
  const cabecalho = painel.slice(0, painel.indexOf('<tbody'))
  const linhas = meios
    .map((meio, i) => `<tr data-ri="${i}" role="row"><td>${i + 1}</td><td><span>16/10/2026</span></td><td>Aviso de abertura de licitação</td><td>${meio}</td><td></td><td>17/10/2026</td><td></td></tr>`)
    .join('')
  return respostaParcial({ j_idt162: `${cabecalho}<tbody>${linhas}</tbody></table></div>` }, 'vs-detalhe')
}

export function erroHttp(status: number | undefined): Error {
  return Object.assign(new Error(status ? `HTTP ${status}` : 'socket hang up'), {
    isAxiosError: true,
    ...(status ? { response: { status } } : { code: 'ECONNRESET' }),
  })
}

export type RespostaFalsa = string | Error

export interface PedidoRegistrado {
  metodo: 'GET' | 'POST'
  caminho: string
  campos: Map<string, string>
  cookie: string | null
}

export interface MuralFalso {
  pagina?: RespostaFalsa | RespostaFalsa[]
  pesquisa?: RespostaFalsa | RespostaFalsa[]
  paginas?: Record<number, RespostaFalsa | RespostaFalsa[]>
  exportacao?: RespostaFalsa | RespostaFalsa[]
  detalhes?: Record<number, RespostaFalsa | RespostaFalsa[]>
  publicacoes?: Record<number, RespostaFalsa | RespostaFalsa[]>
}

export interface RedeFalsaTcePi extends RedeDoTcePi {
  pedidos: PedidoRegistrado[]
  esperas: number[]
}

export function redeFalsaTcePi(mural: MuralFalso): RedeFalsaTcePi {
  const contagem = new Map<string, number>()
  let ultimoDetalhe = 0
  const responder = (chave: string, r: RespostaFalsa | RespostaFalsa[] | undefined): RespostaDoTcePi => {
    const vez = contagem.get(chave) ?? 0
    contagem.set(chave, vez + 1)
    const resposta = Array.isArray(r) ? r[Math.min(vez, r.length - 1)] : r
    if (resposta === undefined) throw new Error(`sem resposta falsa para ${chave}`)
    if (resposta instanceof Error) throw resposta
    return { corpo: resposta, cookies: chave === 'mural' ? ['JSESSIONID=sessao-falsa.no1; path=/muralic'] : [] }
  }
  const rede: RedeFalsaTcePi = {
    pedidos: [],
    esperas: [],
    obter: async (caminho, cookie) => {
      rede.pedidos.push({ metodo: 'GET', caminho, campos: new Map(), cookie })
      const id = Number(caminho.match(/id=(\d+)/)?.[1])
      if (Number.isSafeInteger(id) && id > 0) {
        ultimoDetalhe = id
        return responder(`detalhe-${id}`, mural.detalhes?.[id] ?? detalheFalso('DIVULGADA'))
      }
      return responder('mural', mural.pagina ?? paginaDoTcePi('inicio.html'))
    },
    enviar: async (caminho, campos: CamposDoFormulario, cookie) => {
      const mapa = new Map(campos)
      rede.pedidos.push({ metodo: 'POST', caminho, campos: mapa, cookie })
      const origem = mapa.get('javax.faces.source')
      if (origem === 'btnPesquisar') return responder('pesquisa', mural.pesquisa)
      if (mapa.get(`${TABELA}_pagination`) === 'true') {
        const primeira = Number(mapa.get(`${TABELA}_first`))
        return responder(`pagina-${primeira}`, mural.paginas?.[primeira])
      }
      if (origem?.startsWith(`${TABELA}:`)) return responder('exportacao', mural.exportacao)
      if (origem === 'j_idt162') return responder(`publicacoes-${ultimoDetalhe}`, mural.publicacoes?.[ultimoDetalhe] ?? publicacoesFalsas(['Diário Oficial dos Municípios']))
      throw new Error(`pedido inesperado: ${origem}`)
    },
    esperar: async (ms) => {
      rede.esperas.push(ms)
    },
  }
  return rede
}
