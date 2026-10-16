import { NormalizedTender } from '../../types'
import { SITUACAO_FECHADA, limparTexto, truncar } from '../sescRegional/tipos'
import { aberturaAindaPorVir, modalidadeDoSistemaS, relogioLocalComoBrasilia, urlHttp } from './comum'

export const BASE_DA_API_DO_SENAC = 'https://transparencia.senac.br/service/api'

export const REGIONAIS_DO_SENAC = [
  'ac', 'al', 'am', 'ap', 'ba', 'ce', 'df', 'es', 'go', 'ma', 'mg', 'ms', 'mt', 'pa',
  'pb', 'pe', 'pi', 'pr', 'rj', 'rn', 'ro', 'rr', 'rs', 'sc', 'se', 'sp', 'to', 'dn',
] as const

export type RegionalDoSenac = (typeof REGIONAIS_DO_SENAC)[number]

const UF_DO_DEPARTAMENTO_NACIONAL = 'RJ'
const GUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

interface DocumentoDoSenac {
  id?: string
  nomeDocumento?: string | null
  tipoDocumento?: { descricao?: string | null } | null
  dataPublicacao?: string | null
  arquivoLicitacao?: { nomeArquivo?: string | null } | null
  ativo?: boolean
}

interface LicitacaoDoSenac {
  id?: string
  numeroProcesso?: string | null
  objeto?: string | null
  situacao?: string | null
  dataAbertura?: string | null
  linkPregaoEletronico?: string | null
  criterioDeJulgamento?: string | null
  documentos?: DocumentoDoSenac[] | null
}

interface ModalidadeDoSenac {
  modalidade?: string | null
  dataUltimaCarga?: string | null
  dadosModalidadeLicitacao?: LicitacaoDoSenac[] | null
}

export interface RespostaDoSenac {
  success?: boolean
  data?: ModalidadeDoSenac[] | null
}

export interface AnexoDoSistemaS {
  uri: string
  titulo: string
}

export function caminhoDaRegional(regional: RegionalDoSenac): string {
  return `/licitacoes/regional/${regional}`
}

export function urlDoDocumentoDoSenac(regional: RegionalDoSenac, idLicitacao: string, idDocumento: string): string {
  return `${BASE_DA_API_DO_SENAC}/licitacoes/${encodeURIComponent(idLicitacao)}/regional/${regional}/documento/${encodeURIComponent(idDocumento)}/download`
}

function anexosDoSenac(regional: RegionalDoSenac, licitacao: LicitacaoDoSenac): AnexoDoSistemaS[] {
  const anexos: AnexoDoSistemaS[] = []
  for (const doc of licitacao.documentos ?? []) {
    if (doc.ativo === false || !doc.id || !GUID.test(doc.id)) continue
    const tipo = limparTexto(doc.tipoDocumento?.descricao)
    const nome = limparTexto(doc.arquivoLicitacao?.nomeArquivo) || limparTexto(doc.nomeDocumento)
    anexos.push({
      uri: urlDoDocumentoDoSenac(regional, licitacao.id!, doc.id),
      titulo: [tipo, nome].filter(Boolean).join(' - ') || 'Documento',
    })
  }
  return anexos
}

function primeiraPublicacao(licitacao: LicitacaoDoSenac): Date | undefined {
  const datas = (licitacao.documentos ?? [])
    .map((doc) => (doc.dataPublicacao ? new Date(doc.dataPublicacao) : undefined))
    .filter((d): d is Date => d !== undefined && !Number.isNaN(d.getTime()))
    .sort((a, b) => a.getTime() - b.getTime())
  return datas[0]
}

function linkDoEdital(regional: RegionalDoSenac, licitacao: LicitacaoDoSenac, anexos: AnexoDoSistemaS[]): string {
  const edital = anexos.find((a) => /^edital\b/i.test(a.titulo))
  return edital?.uri ?? urlHttp(licitacao.linkPregaoEletronico) ?? anexos[0]?.uri ?? `https://transparencia.senac.br/#/${regional}/licitacoes`
}

export function lerRespostaDoSenac(texto: string): RespostaDoSenac {
  let resposta: RespostaDoSenac
  try {
    resposta = JSON.parse(texto) as RespostaDoSenac
  } catch {
    throw new Error('Senac: resposta não é JSON válido')
  }
  if (resposta.success === false || !Array.isArray(resposta.data)) throw new Error('Senac: resposta sem a lista de modalidades')
  return resposta
}

export function parseLicitacoesDoSenac(resposta: RespostaDoSenac, regional: RegionalDoSenac, agora: Date): NormalizedTender[] {
  const sigla = regional.toUpperCase()
  const uf = regional === 'dn' ? UF_DO_DEPARTAMENTO_NACIONAL : sigla
  const resultado: NormalizedTender[] = []

  for (const grupo of resposta.data ?? []) {
    const nomeDaModalidade = limparTexto(grupo.modalidade)
    for (const licitacao of grupo.dadosModalidadeLicitacao ?? []) {
      const objeto = limparTexto(licitacao.objeto)
      if (!licitacao.id || !GUID.test(licitacao.id) || !objeto) continue
      const situacao = limparTexto(licitacao.situacao)
      if (!situacao || SITUACAO_FECHADA.test(situacao)) continue
      const abertura = relogioLocalComoBrasilia(licitacao.dataAbertura)
      if (!aberturaAindaPorVir(abertura, agora)) continue

      const anexos = anexosDoSenac(regional, licitacao)
      resultado.push({
        fonte: 'SISTEMA_S',
        fonteId: `SENAC-${sigla}:${licitacao.id.toLowerCase()}`,
        modalidade: modalidadeDoSistemaS(nomeDaModalidade),
        objeto,
        objetoResumido: truncar(objeto),
        uf,
        orgao: `SENAC-${sigla}`,
        aberturaAt: abertura,
        encerramentoAt: abertura,
        publicadoAt: primeiraPublicacao(licitacao),
        linkEdital: linkDoEdital(regional, licitacao, anexos),
        numeroControle: limparTexto(licitacao.numeroProcesso) || undefined,
        rawJson: {
          plataforma: 'SENAC',
          regional: sigla,
          modalidade: nomeDaModalidade,
          situacao,
          criterioDeJulgamento: limparTexto(licitacao.criterioDeJulgamento) || undefined,
          linkDaDisputa: urlHttp(licitacao.linkPregaoEletronico),
          cargaDoRegional: grupo.dataUltimaCarga ?? undefined,
          anexos,
        },
      })
    }
  }
  return resultado
}
