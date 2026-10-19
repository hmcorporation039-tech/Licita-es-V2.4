import { famemClient } from '../lib/httpClient'
import { comparacaoDoNumeroDoAviso, modalidadeIncerta, numeroDoAviso, podeEsconderComoRepeticao } from '../lib/repeticaoDoPncp'
import { NormalizedTender } from '../types'
import { candidatosDoPncp } from './queridoDiarioService'
import {
  CAMINHO_DA_LISTA_DE_PUBLICACOES,
  CAMINHO_DA_PAGINA_DE_PUBLICACOES,
  CAMINHO_DA_PUBLICACAO,
  ORIGEM_FAMEM,
} from './famemParser'

export const NOME_DO_COOKIE_DA_SESSAO = 'ci_session'

const VALOR_DO_COOKIE = /^[A-Za-z0-9%-]{8,128}$/
const ID_DA_PUBLICACAO = /^\d{1,10}$/

export class SessaoDaFamemAusente extends Error {
  constructor() {
    super(`A FAMEM não devolveu o cookie ${NOME_DO_COOKIE_DA_SESSAO} na página de publicações`)
  }
}

export function cookieDaSessao(setCookie: string | string[] | undefined): string | null {
  const linhas = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : []
  for (const linha of linhas) {
    const [par] = linha.split(';')
    const separador = par.indexOf('=')
    if (separador < 0 || par.slice(0, separador).trim() !== NOME_DO_COOKIE_DA_SESSAO) continue
    const valor = par.slice(separador + 1).trim()
    if (VALOR_DO_COOKIE.test(valor)) return `${NOME_DO_COOKIE_DA_SESSAO}=${valor}`
  }
  return null
}

function comoTexto(dados: unknown): string {
  return typeof dados === 'string' ? dados : String(dados ?? '')
}

export async function abrirSessaoDaFamem(): Promise<string> {
  const resposta = await famemClient.get<string>(CAMINHO_DA_PAGINA_DE_PUBLICACOES, {
    responseType: 'text',
    transformResponse: (dados) => dados,
  })
  const cookie = cookieDaSessao(resposta.headers['set-cookie'] as string[] | string | undefined)
  if (!cookie) throw new SessaoDaFamemAusente()
  return cookie
}

export async function baixarListaDaFamem(cookie: string): Promise<string> {
  const resposta = await famemClient.get<string>(CAMINHO_DA_LISTA_DE_PUBLICACOES, {
    responseType: 'text',
    transformResponse: (dados) => dados,
    headers: {
      Cookie: cookie,
      Accept: 'application/json, text/javascript, */*; q=0.01',
      'X-Requested-With': 'XMLHttpRequest',
      Referer: `${ORIGEM_FAMEM}${CAMINHO_DA_PAGINA_DE_PUBLICACOES}`,
    },
  })
  return comoTexto(resposta.data)
}

export async function baixarPublicacaoDaFamem(id: string): Promise<string> {
  if (!ID_DA_PUBLICACAO.test(id)) throw new Error(`Identificador de publicação da FAMEM inválido: ${id}`)
  const resposta = await famemClient.get<string>(`${CAMINHO_DA_PUBLICACAO}/${id}`, {
    responseType: 'text',
    transformResponse: (dados) => dados,
  })
  return comoTexto(resposta.data)
}

export async function licitacaoDoPncpPelaRegraEstrita(tender: NormalizedTender, agora: Date = new Date()): Promise<string | null> {
  const candidatos = await candidatosDoPncp(tender, agora, !modalidadeIncerta(tender))
  const numero = numeroDoAviso(tender.fonteId)
  return candidatos.find((candidato) => podeEsconderComoRepeticao(tender, candidato, comparacaoDoNumeroDoAviso(numero, candidato)))?.id ?? null
}

export async function existeNoPncpPelaRegraEstrita(tender: NormalizedTender, agora: Date = new Date()): Promise<boolean> {
  return (await licitacaoDoPncpPelaRegraEstrita(tender, agora)) !== null
}
