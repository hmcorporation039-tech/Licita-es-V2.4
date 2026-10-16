import { ModalidadeEnum } from '../../types'
import { EmpresaDoParadigma, ProcessoParadigma, criarUnidadeParadigma, semControle } from '../sescRegional/paradigma'
import { SescUnidade } from '../sescRegional/tipos'
import { entidadesDoNome, horarioDeBrasilia, modalidadeDoSistemaS, orgaoDasEntidades } from './comum'

export const PREFIXO_DO_PARADIGMA_DA_INDUSTRIA = 'IND-PDG'

const SITUACAO_FORA_DA_INDUSTRIA = /suspens|homologa|negocia|habilita|aceitabilidade|analise|análise|adjudica|encerrad|cancelad|revogad|fracassad|desert/i

interface FederacaoNoParadigma {
  uf: string
  sigla: string
  base: string
}

export const FEDERACOES_NO_PARADIGMA: FederacaoNoParadigma[] = [
  { uf: 'BA', sigla: 'FIEB', base: 'https://compras.fieb.org.br' },
  { uf: 'CE', sigla: 'FIEC', base: 'https://portaldecompras.sfiec.org.br' },
  { uf: 'ES', sigla: 'FINDES', base: 'https://portaldecompras.findes.org.br' },
  { uf: 'MG', sigla: 'FIEMG', base: 'https://compras.fiemg.com.br' },
  { uf: 'MS', sigla: 'FIEMS', base: 'https://compras.fiems.com.br' },
  { uf: 'MT', sigla: 'FIEMT', base: 'https://compras.sfiemt.ind.br' },
  { uf: 'RJ', sigla: 'FIRJAN', base: 'https://portaldecompras.firjan.com.br' },
  { uf: 'RS', sigla: 'FIERGS', base: 'https://compras.sistemafiergs.org.br' },
  { uf: 'SC', sigla: 'FIESC', base: 'https://portaldecompras.fiesc.com.br' },
]

const CNPJ_NO_NOME = /^\s*(\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2})\s*-\s*/

export function dataDoParadigmaEmBrasilia(valor?: string | null): Date | undefined {
  const ms = Number(valor?.match(/-?\d+/)?.[0])
  if (!Number.isFinite(ms)) return undefined
  const relogio = new Date(ms)
  if (Number.isNaN(relogio.getTime())) return undefined
  return horarioDeBrasilia(
    relogio.getUTCFullYear(),
    relogio.getUTCMonth() + 1,
    relogio.getUTCDate(),
    relogio.getUTCHours(),
    relogio.getUTCMinutes()
  )
}

export function empresaDaIndustria(nome: string, federacao: Pick<FederacaoNoParadigma, 'uf' | 'sigla'>): EmpresaDoParadigma | null {
  const cnpj = nome.match(CNPJ_NO_NOME)?.[1]?.replace(/\D/g, '')
  const unidade = semControle(nome.replace(CNPJ_NO_NOME, ''))
  const orgao = orgaoDasEntidades(entidadesDoNome(unidade, federacao.sigla), federacao.uf, federacao.sigla)
  if (!orgao) return null
  return { orgao, cnpj: cnpj && cnpj.length === 14 ? cnpj : undefined, unidade: unidade || undefined }
}

export function modalidadeDoParadigmaDaIndustria(processo: ProcessoParadigma, situacao: string): ModalidadeEnum {
  const tipo = semControle(processo.sNmModalidadeTipo)
  const nome = semControle(processo.sNmModalidade)
  return modalidadeDoSistemaS(`${tipo && tipo !== '-' ? tipo : ''} ${nome}`, situacao)
}

export function criarUnidadeDaIndustriaNoParadigma(federacao: FederacaoNoParadigma): SescUnidade {
  const unidade = criarUnidadeParadigma({
    uf: federacao.uf,
    nome: federacao.sigla,
    base: federacao.base,
    fonte: 'SISTEMA_S',
    prefixoFonteId: PREFIXO_DO_PARADIGMA_DA_INDUSTRIA,
    empresa: (nome) => empresaDaIndustria(nome, federacao),
    modalidade: modalidadeDoParadigmaDaIndustria,
    lerData: dataDoParadigmaEmBrasilia,
    situacaoFora: SITUACAO_FORA_DA_INDUSTRIA,
  })
  return {
    ...unidade,
    parse: (texto, ctx) =>
      unidade.parse(texto, ctx).filter((t) => !t.encerramentoAt || t.encerramentoAt.getTime() >= ctx.agora.getTime()),
  }
}

export const UNIDADES_DA_INDUSTRIA_NO_PARADIGMA: SescUnidade[] = FEDERACOES_NO_PARADIGMA.map(criarUnidadeDaIndustriaNoParadigma)

export function contarProcessosDoParadigma(texto: string): number {
  try {
    const d = (JSON.parse(texto) as { d?: unknown }).d
    return Array.isArray(d) ? d.length : 0
  } catch {
    return 0
  }
}
