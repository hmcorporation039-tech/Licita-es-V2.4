import { somenteDigitos } from '../documentos'
import { marcador, type Certame, type Proponente } from './modelo'

export interface EmpresaParaDocumento {
  name: string
  tipo: 'PESSOA_FISICA' | 'PESSOA_JURIDICA'
  cnpj: string | null
  cpf: string | null
  email: string | null
  telefone: string | null
  responsavel: string | null
  responsavelCpf: string | null
  responsavelCargo: string | null
  dadosBancarios: string | null
  endereco: string | null
  enderecoNumero: string | null
  enderecoComplemento: string | null
  enderecoBairro: string | null
  enderecoCidade: string | null
  enderecoUf: string | null
  cep: string | null
}

export interface LicitacaoParaDocumento {
  orgao: string | null
  numeroControle: string | null
  modalidade: string | null
  objeto: string
  sessao: Date | null
}

const MODALIDADES: Record<string, string> = {
  PREGAO_ELETRONICO: 'Pregão Eletrônico',
  PREGAO_PRESENCIAL: 'Pregão Presencial',
  CONCORRENCIA: 'Concorrência',
  DISPENSA_COM_DISPUTA: 'Dispensa Eletrônica',
  DISPENSA_SEM_DISPUTA: 'Dispensa de Licitação',
  INEXIGIBILIDADE: 'Inexigibilidade',
  CONVITE: 'Convite',
  TOMADA_DE_PRECOS: 'Tomada de Preços',
  CONCURSO: 'Concurso',
  CREDENCIAMENTO: 'Credenciamento',
  DIALOGO_COMPETITIVO: 'Diálogo Competitivo',
  OUTROS: 'Licitação',
}

export function formatarCnpj(valor: string): string {
  const d = somenteDigitos(valor)
  return d.length === 14 ? `${d.slice(0, 2)}.${d.slice(2, 5)}.${d.slice(5, 8)}/${d.slice(8, 12)}-${d.slice(12)}` : valor
}

export function formatarCpf(valor: string): string {
  const d = somenteDigitos(valor)
  return d.length === 11 ? `${d.slice(0, 3)}.${d.slice(3, 6)}.${d.slice(6, 9)}-${d.slice(9)}` : valor
}

function formatarCep(valor: string): string {
  const d = somenteDigitos(valor)
  return d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : valor
}

const limpo = (v: string | null | undefined) => (v ?? '').trim()

export function dadosDoProponente(e: EmpresaParaDocumento): Proponente {
  const pendencias: string[] = []
  const exigir = (valor: string, rotulo: string): string => {
    if (valor) return valor
    pendencias.push(rotulo)
    return marcador(rotulo)
  }

  const juridica = e.tipo === 'PESSOA_JURIDICA'
  const numeroDoDocumento = juridica ? limpo(e.cnpj) : limpo(e.cpf)
  const documento = numeroDoDocumento
    ? juridica
      ? `CNPJ nº ${formatarCnpj(numeroDoDocumento)}`
      : `CPF nº ${formatarCpf(numeroDoDocumento)}`
    : exigir('', juridica ? 'CNPJ da empresa' : 'CPF')

  const logradouro = limpo(e.endereco) ? [limpo(e.endereco), limpo(e.enderecoNumero)].filter(Boolean).join(', ') : ''
  const cidadeUf = [limpo(e.enderecoCidade), limpo(e.enderecoUf).toUpperCase()].filter(Boolean).join('/')
  const partesDoEndereco = [logradouro, limpo(e.enderecoComplemento), limpo(e.enderecoBairro), cidadeUf, e.cep ? `CEP ${formatarCep(e.cep)}` : '']
    .filter(Boolean)
    .join(' – ')

  const razaoSocial = exigir(limpo(e.name), juridica ? 'razão social' : 'nome completo')
  const endereco = exigir(logradouro && cidadeUf ? partesDoEndereco : '', juridica ? 'endereço completo da empresa' : 'endereço completo')
  const cidade = exigir(cidadeUf, juridica ? 'cidade/UF da empresa' : 'cidade/UF')

  if (!juridica) {
    const cpfProprio = numeroDoDocumento ? formatarCpf(numeroDoDocumento) : documento
    return {
      razaoSocial,
      documento,
      qualificacao: `${razaoSocial}, inscrito(a) no ${documento}, residente e domiciliado(a) em ${endereco}`,
      endereco,
      cidadeUf: cidade,
      telefone: limpo(e.telefone),
      email: limpo(e.email),
      responsavel: limpo(e.responsavel) || razaoSocial,
      responsavelCpf: e.responsavelCpf ? formatarCpf(e.responsavelCpf) : cpfProprio,
      responsavelCargo: limpo(e.responsavelCargo) || 'Proponente',
      dadosBancarios: limpo(e.dadosBancarios),
      pendencias,
    }
  }

  const responsavel = exigir(limpo(e.responsavel), 'nome do responsável legal')
  const responsavelCpf = exigir(e.responsavelCpf ? formatarCpf(e.responsavelCpf) : '', 'CPF do responsável legal')
  return {
    razaoSocial,
    documento,
    qualificacao: `${razaoSocial}, inscrita no ${documento}, com sede em ${endereco}, por intermédio de seu representante legal, ${responsavel}, portador(a) do CPF nº ${responsavelCpf}`,
    endereco,
    cidadeUf: cidade,
    telefone: limpo(e.telefone),
    email: limpo(e.email),
    responsavel,
    responsavelCpf,
    responsavelCargo: limpo(e.responsavelCargo) || 'Representante legal',
    dadosBancarios: limpo(e.dadosBancarios),
    pendencias,
  }
}

const formatoDaData = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' })

export function dadosDoCertame(t: LicitacaoParaDocumento): Certame {
  return {
    orgao: limpo(t.orgao) || marcador('órgão licitante'),
    numero: limpo(t.numeroControle) || marcador('número do processo/edital'),
    modalidade: (t.modalidade && MODALIDADES[t.modalidade]) || 'Licitação',
    objeto: limpo(t.objeto),
    sessao: t.sessao ? formatoDaData.format(t.sessao).replace(',', ' às') : '',
  }
}

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']

export function localEData(proponente: Proponente, quando: Date = new Date()): string {
  const partes = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'America/Sao_Paulo' })
    .formatToParts(quando)
    .reduce<Record<string, string>>((acc, p) => ({ ...acc, [p.type]: p.value }), {})
  const cidade = proponente.cidadeUf.startsWith('[') ? proponente.cidadeUf : proponente.cidadeUf.split('/')[0]
  return `${cidade}, ${partes.day} de ${MESES[Number(partes.month) - 1]} de ${partes.year}.`
}
