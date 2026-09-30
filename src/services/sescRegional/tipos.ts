// ============================================================
// services/sescRegional/tipos.ts — Contrato e helpers comuns aos parsers dos
// portais de licitação dos Departamentos Regionais do SESC.
//
// Cada unidade (AM, SC, MT...) tem um site diferente, então cada uma tem o seu
// parser em services/sescRegional/<uf>.ts. Todos seguem este contrato e usam
// estes helpers, para que "licitação atual" e "modalidade" signifiquem a mesma
// coisa em todas as unidades.
//
// Só licitações ATUAIS entram no sistema (abertas / com sessão a realizar).
// Histórico e processos encerrados são descartados já no parser.
// ============================================================

import { ModalidadeEnum, NormalizedTender } from '../../types'

export interface ContextoDeParse {
  // URL da página de onde veio o HTML (base para resolver links relativos).
  url: string
  // "Agora" injetado — os testes fixam a data; em produção é new Date().
  agora: Date
}

export interface SescUnidade {
  // Sigla da UF ('AM', 'SC'...). Para o DN use 'DF' e nome 'Sesc Departamento Nacional'.
  uf: string
  // Nome de exibição, vira Tender.orgao (ex.: 'Sesc Amazonas').
  nome: string
  cnpj?: string
  // Páginas a buscar. Pode depender da data (ex.: página do ano corrente).
  urls: (agora: Date) => string[]
  // Converte o HTML de UMA página em licitações atuais. Puro (sem rede).
  parse: (html: string, ctx: ContextoDeParse) => NormalizedTender[]
  // Opcional: a partir do HTML de uma página, outras páginas da mesma listagem
  // (paginação). O coletor segue no máximo MAX_PAGINAS_POR_UNIDADE.
  proximasPaginas?: (html: string, ctx: ContextoDeParse) => string[]
  // Opcional: página a abrir ANTES das demais para obter o cookie de sessão
  // (alguns portais só respondem às listagens com o cookie e o Referer dessa
  // página — ex.: o MT, cuja lista é carregada por AJAX). O coletor guarda os
  // cookies e os reenvia nas páginas da unidade, com esta URL como Referer.
  sessaoUrl?: string
  // Opcional: certificados intermediários (PEM) que o servidor do portal não
  // envia e que devem ser confiados SÓ para esta unidade (ver certificados.ts).
  certificadosConfiaveis?: string[]
}

export const MAX_PAGINAS_POR_UNIDADE = 8

// Situações que indicam processo encerrado/sem efeito. Por exclusão: só
// descartamos o que reconhecemos claramente como estado final.
export const SITUACAO_FECHADA =
  /encerrad|cancelad|revogad|anulad|homologad|fracassad|conclu[íi]d|finalizad|suspens|deserta|adjudicad|contratad|arquivad/i

// Decodifica o corpo respeitando o charset declarado (cabeçalho ou <meta>);
// vários portais do SESC ainda servem ISO-8859-1.
export function decodificarHtml(buffer: Buffer, contentType?: string): string {
  const declarado =
    contentType?.match(/charset=([\w-]+)/i)?.[1] ??
    buffer.subarray(0, 4096).toString('latin1').match(/<meta[^>]+charset=["']?([\w-]+)/i)?.[1]
  const label = (declarado ?? 'utf-8').toLowerCase()
  try {
    return new TextDecoder(label).decode(buffer)
  } catch {
    return buffer.toString('utf8')
  }
}

export function limparTexto(texto: string | null | undefined): string {
  return (texto ?? '').replace(/\s+/g, ' ').trim()
}

export function truncar(texto: string, max = 500): string {
  if (!texto) return ''
  return texto.length > max ? texto.slice(0, max - 3) + '...' : texto
}

// Resolve um href (possivelmente relativo) contra a URL da página. undefined
// se não for http(s) válido (javascript:, mailto:, âncora vazia...).
export function urlAbsoluta(href: string | null | undefined, base: string): string | undefined {
  if (!href) return undefined
  const h = href.trim()
  if (!h || h.startsWith('#') || /^(javascript|mailto|tel):/i.test(h)) return undefined
  try {
    const u = new URL(h, base)
    return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : undefined
  } catch {
    return undefined
  }
}

// Início do dia de `agora` (00:00 local) — uma sessão marcada para hoje ainda é
// atual, mesmo que o horário já tenha passado.
function inicioDoDia(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}

// Regra única de "licitação atual":
//  - situação textual de estado final  -> descarta;
//  - data de encerramento (ou, sem ela, a de abertura/sessão) anterior a hoje -> descarta;
//  - sem data e sem situação -> mantém (quem chama só deve passar itens de
//    listagens que o próprio portal já separa como "abertas/em andamento").
export function ehLicitacaoAtual(
  info: { situacao?: string; encerramentoAt?: Date; aberturaAt?: Date },
  agora: Date
): boolean {
  if (info.situacao && SITUACAO_FECHADA.test(info.situacao)) return false
  const referencia = info.encerramentoAt ?? info.aberturaAt
  if (referencia && referencia.getTime() < inicioDoDia(agora).getTime()) return false
  return true
}

// Portais que NÃO informam data de sessão/encerramento (só a de publicação) e
// mantêm processos antigos como "em andamento" para sempre (ex.: DF) não dão
// como saber, pela data de sessão, o que ainda está aberto. Nesses, vale a
// recência da publicação: só entra o que foi publicado nos últimos N dias.
// Sem data de publicação também fica de fora (não dá para afirmar que é atual).
// Ajustável por SESC_JANELA_PUBLICACAO_DIAS (padrão 60).
export function janelaPublicacaoDias(): number {
  const v = Number(process.env.SESC_JANELA_PUBLICACAO_DIAS)
  return Number.isFinite(v) && v > 0 ? v : 60
}

export function publicadaRecentemente(publicadoAt: Date | undefined, agora: Date): boolean {
  if (!publicadoAt) return false
  const limite = inicioDoDia(agora).getTime() - janelaPublicacaoDias() * 24 * 60 * 60 * 1000
  return publicadoAt.getTime() >= limite
}

// Modalidade a partir do texto livre do portal. Regulamento de Licitações e
// Contratos do SESC: pregão, concorrência, dispensa, inexigibilidade,
// credenciamento, convite, tomada de preços, concurso; o que não reconhecer
// (chamamento, cotação, coleta de preços, leilão...) vira OUTROS.
export function detectarModalidade(texto: string): ModalidadeEnum {
  const t = texto
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
  if (/pregao/.test(t)) return /presencial/.test(t) ? 'PREGAO_PRESENCIAL' : 'PREGAO_ELETRONICO'
  if (/concorrencia/.test(t)) return 'CONCORRENCIA'
  if (/inexigibilidade/.test(t)) return 'INEXIGIBILIDADE'
  if (/dispensa/.test(t)) return 'DISPENSA_SEM_DISPUTA'
  if (/credenciamento/.test(t)) return 'CREDENCIAMENTO'
  if (/tomada de preco/.test(t)) return 'TOMADA_DE_PRECOS'
  if (/convite/.test(t)) return 'CONVITE'
  if (/concurso/.test(t)) return 'CONCURSO'
  return 'OUTROS'
}

// Monta o NormalizedTender padrão das unidades do SESC Regional. O parser de
// cada unidade só preenche o que o portal traz.
export function montarTender(
  unidade: Pick<SescUnidade, 'uf' | 'nome' | 'cnpj'>,
  dados: {
    // Identificador estável da licitação dentro da unidade (nº do processo,
    // id do portal...). Compõe o fonteId — precisa ser o mesmo a cada coleta.
    idLocal: string
    objeto: string
    modalidadeTexto?: string
    modalidade?: ModalidadeEnum
    numeroControle?: string
    valorEstimado?: number
    aberturaAt?: Date
    encerramentoAt?: Date
    publicadoAt?: Date
    linkEdital?: string
    anexos?: { uri: string; titulo: string }[]
  }
): NormalizedTender {
  const objeto = limparTexto(dados.objeto)
  const id = limparTexto(dados.idLocal).replace(/[^\w.-]+/g, '-').replace(/-+/g, '-')
  return {
    fonte: 'SESC_REGIONAL',
    fonteId: `SESC-${unidade.uf}-${id}`,
    modalidade: dados.modalidade ?? detectarModalidade(dados.modalidadeTexto ?? objeto),
    objeto,
    objetoResumido: truncar(objeto),
    valorEstimado: dados.valorEstimado,
    uf: unidade.uf,
    orgao: unidade.nome,
    orgaoCnpj: unidade.cnpj,
    aberturaAt: dados.aberturaAt,
    encerramentoAt: dados.encerramentoAt,
    publicadoAt: dados.publicadoAt,
    linkEdital: dados.linkEdital ?? dados.anexos?.[0]?.uri,
    numeroControle: dados.numeroControle,
    rawJson: { unidade: unidade.nome, anexos: dados.anexos ?? [] },
  }
}
