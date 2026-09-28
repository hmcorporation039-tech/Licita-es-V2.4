// ============================================================
// services/sestSenatParser.ts — Normaliza a resposta do "dados abertos"
// do SEST SENAT (transparencia.sestsenat.org.br/api/edital/dadosAbertos).
// Reconhecimento manual em 2026-09-28: API JSON real, sem login — mas o
// filtro por empresa (SEST/SENAT) no servidor é INCONSISTENTE: às vezes
// devolve só a empresa pedida, às vezes devolve as duas misturadas (testado
// duas vezes contra o mesmo request, resultado diferente). Ano, código de
// edital e paginação são sempre ignorados. Por isso normalizarRegistroSestSenat
// não confia no parâmetro pedido — usa o campo `empresa` que vem em CADA
// registro, então fica correto mesmo se o servidor devolver tudo junto. Só
// entra licitação com `situacao` "Edital Aberto" (ver filtrarSomenteAbertos)
// — o resto (encerrada, fracassada, cancelada...) não é salvo.
//
// SEST e SENAT são duas entidades jurídicas do Sistema S (mesma categoria
// do SESC/FIEG — Serviço Social Autônomo, não segue a Lei 14.133).
//
// Sem acesso a PDF: o único endpoint que devolve link de anexo
// (edital/pesquisar/) está travado sempre nos mesmos 5 registros,
// independente do filtro — não veio parte do escopo desta etapa.
// ============================================================

import { NormalizedTender, SEST_SENAT_MODALIDADE_MAP } from '../types'
import { parseDataBr, parseValorBr } from '../lib/scrapingHelpers'

export type SestSenatEmpresa = 'SEST' | 'SENAT'

const CNPJ_POR_EMPRESA: Record<SestSenatEmpresa, string> = {
  SEST: '73471989000195',
  SENAT: '73471963000147',
}

const NOME_POR_EMPRESA: Record<SestSenatEmpresa, string> = {
  SEST: 'Serviço Social do Transporte - SEST',
  SENAT: 'Serviço Nacional de Aprendizagem do Transporte - SENAT',
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export interface RegistroSestSenat extends Record<string, any> {
  empresa: string
  nomeFilial: string
  modalidade: string
  codigoEdital: string
  numeroProcesso: string
  objeto: string
  dataHomologacao: string | null
  dataProposta: string | null
  dataAbertura: string | null
  valorProposta: string | null
  valorVencido: string | null
  situacao: string
  uf: string | null
}

function truncate(str: string, max = 500): string {
  if (!str) return ''
  return str.length > max ? str.slice(0, max - 3) + '...' : str
}

// A resposta às vezes embute um byte de controle bruto (\u0000) dentro de
// string — inválido pelo padrão JSON, mas o axios (e o JSON.parse do V8)
// rejeitam. Limpa antes de fazer o parse.
export function parseSestSenatDadosAbertos(textoBruto: string): RegistroSestSenat[] {
  // eslint-disable-next-line no-control-regex
  const limpo = textoBruto.replace(/[\u0000-\u001F]/g, '')
  return JSON.parse(limpo)
}

// "BRASILIA/DF" no fim do nome da filial -> "DF". null se não achar o padrão.
function extrairUf(nomeFilial: string): string | undefined {
  const m = nomeFilial.match(/\/([A-Z]{2})\s*$/)
  return m ? m[1] : undefined
}

// Licitação encerrada/executada não entra no sistema — em nenhuma fonte
// (ver mesmo princípio em sescGoParser.ts, fiegParser.ts, novacapParser.ts).
// Aqui o sinal é direto: dos valores reais de `situacao` vistos em produção
// ("Anulado", "Edital Aberto", "Edital Encerrado", "Edital Fracassado",
// "Edital Impugnado", "Edital Remanescente", "Processo Licitatório
// Cancelado", "Processo Licitatório Revogado"), só "Edital Aberto" contém
// "aberto" — os outros sete são todos estado final. Substitui o corte por
// ano anterior: como só entra o que está aberto, filtrar por idade não
// fazia mais sentido (e o site nem devolve o histórico todo mesmo).
export function filtrarSomenteAbertos(registros: RegistroSestSenat[]): RegistroSestSenat[] {
  return registros.filter((r) => /aberto/i.test(r.situacao ?? ''))
}

// Deriva SEST/SENAT do próprio registro — nunca do parâmetro de filtro que
// foi pedido ao servidor (ver aviso no topo do arquivo: o filtro não é
// confiável). "SENAT" é checado primeiro por ser o mais específico —
// qualquer coisa que não bata claramente cai em SEST (é a entidade-mãe,
// aparece sozinha nos registros mais antigos/genéricos).
function empresaDoRegistro(r: RegistroSestSenat): SestSenatEmpresa {
  const valor = (r.empresa ?? '').trim().toUpperCase()
  return valor.includes('SENAT') ? 'SENAT' : 'SEST'
}

export function normalizarRegistroSestSenat(r: RegistroSestSenat): NormalizedTender {
  const empresa = empresaDoRegistro(r)
  const modalidadeNorm = (r.modalidade ?? '').trim().toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
  // eslint-disable-next-line no-control-regex
  const objeto = (r.objeto ?? '').replace(/\u0000/g, '').trim()
  const valor = parseValorBr(r.valorVencido) || parseValorBr(r.valorProposta)

  return {
    fonte: 'SEST_SENAT',
    fonteId: `SESTSENAT-${empresa}-${r.codigoEdital.trim().replace(/[/\s]+/g, '-')}`,
    modalidade: SEST_SENAT_MODALIDADE_MAP[modalidadeNorm] ?? 'OUTROS',
    objeto,
    objetoResumido: truncate(objeto),
    valorEstimado: valor,
    uf: r.uf ?? extrairUf(r.nomeFilial ?? ''),
    orgao: NOME_POR_EMPRESA[empresa],
    orgaoCnpj: CNPJ_POR_EMPRESA[empresa],
    unidade: (r.nomeFilial ?? '').trim() || undefined,
    encerramentoAt: parseDataBr(r.dataProposta) ?? parseDataBr(r.dataHomologacao),
    numeroControle: r.codigoEdital?.trim(),
    rawJson: {},
  }
}
