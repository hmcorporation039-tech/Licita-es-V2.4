export type TomDaSituacao = 'neutral' | 'accent' | 'ok' | 'warn' | 'danger'

export interface ItemDoResultado {
  situacaoDoResultado?: string | null
  quantidade?: string | number | null
  valorUnitario?: string | number | null
  valorTotal?: string | number | null
  valorUnitarioHomologado?: string | number | null
  quantidadeHomologada?: string | number | null
  valorTotalHomologado?: string | number | null
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function numero(valor: string | number | null | undefined): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const n = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(n) ? n : null
}

function positivo(valor: string | number | null | undefined): number | null {
  const n = numero(valor)
  return n !== null && n > 0 ? n : null
}

export function situacaoHomologada(situacao: string | null | undefined): boolean {
  return !!situacao && semAcento(situacao) === 'homologado'
}

export function situacaoEmAndamento(situacao: string | null | undefined): boolean {
  return !situacao || semAcento(situacao) === 'em andamento'
}

export function tomDaSituacao(situacao: string | null | undefined): TomDaSituacao {
  if (!situacao) return 'neutral'
  const texto = semAcento(situacao)
  if (texto === 'homologado') return 'ok'
  if (texto === 'em andamento') return 'accent'
  if (/anulad|revogad|cancelad/.test(texto)) return 'danger'
  if (texto.includes('fracassad')) return 'warn'
  return 'neutral'
}

export function unitarioEstimado(item: ItemDoResultado): number | null {
  const unitario = positivo(item.valorUnitario)
  if (unitario !== null) return unitario
  const total = positivo(item.valorTotal)
  const quantidade = positivo(item.quantidade)
  return total !== null && quantidade !== null ? total / quantidade : null
}

export function unitarioHomologado(item: ItemDoResultado): number | null {
  const unitario = positivo(item.valorUnitarioHomologado)
  if (unitario !== null) return unitario
  const total = positivo(item.valorTotalHomologado)
  const quantidade = positivo(item.quantidadeHomologada)
  return total !== null && quantidade !== null ? total / quantidade : null
}

export function totalHomologadoDoItem(item: ItemDoResultado): number | null {
  const total = positivo(item.valorTotalHomologado)
  if (total !== null) return total
  const unitario = positivo(item.valorUnitarioHomologado)
  const quantidade = positivo(item.quantidadeHomologada)
  return unitario !== null && quantidade !== null ? unitario * quantidade : null
}

export function diferencaPercentual(item: ItemDoResultado): number | null {
  const vencedor = unitarioHomologado(item)
  const estimado = unitarioEstimado(item)
  if (vencedor === null || estimado === null) return null
  return (vencedor / estimado - 1) * 100
}

export interface ResumoDoResultado {
  itens: number
  homologados: number
  comSituacaoFinal: number
  totalHomologado: number | null
  percentualAbaixoDoEstimado: number | null
}

export function resumoDoResultado(itens: ItemDoResultado[]): ResumoDoResultado {
  const homologados = itens.filter((i) => situacaoHomologada(i.situacaoDoResultado))
  const totais = homologados.map(totalHomologadoDoItem).filter((v): v is number => v !== null)
  let estimadoComparavel = 0
  let homologadoComparavel = 0
  for (const item of homologados) {
    const estimado = unitarioEstimado(item)
    const homologado = totalHomologadoDoItem(item)
    const quantidade = positivo(item.quantidadeHomologada) ?? positivo(item.quantidade)
    if (estimado === null || homologado === null || quantidade === null) continue
    estimadoComparavel += estimado * quantidade
    homologadoComparavel += homologado
  }
  return {
    itens: itens.length,
    homologados: homologados.length,
    comSituacaoFinal: itens.filter((i) => !situacaoEmAndamento(i.situacaoDoResultado)).length,
    totalHomologado: totais.length > 0 ? totais.reduce((soma, v) => soma + v, 0) : null,
    percentualAbaixoDoEstimado: estimadoComparavel > 0 ? (1 - homologadoComparavel / estimadoComparavel) * 100 : null,
  }
}

export const MENSAGEM_SEM_RESULTADO = 'O resultado ainda não saiu no PNCP. A Licita Bela confere algumas vezes por dia.'

export function formatarReais(valor: number): string {
  return valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })
}

export function formatarPercentual(valor: number): string {
  return `${Math.abs(valor).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}

export function textoDaComparacaoComEstimado(percentualAbaixo: number): string {
  if (Math.abs(percentualAbaixo) < 0.05) return 'igual ao estimado'
  return `${formatarPercentual(percentualAbaixo)} ${percentualAbaixo > 0 ? 'abaixo' : 'acima'} do estimado`
}

export function textoDoResumo(resumo: ResumoDoResultado): string {
  if (resumo.homologados === 0 && resumo.comSituacaoFinal === 0) return MENSAGEM_SEM_RESULTADO
  const partes = [`${resumo.homologados} de ${resumo.itens} ${resumo.itens === 1 ? 'item homologado' : 'itens homologados'}`]
  if (resumo.totalHomologado !== null) partes.push(`total homologado ${formatarReais(resumo.totalHomologado)}`)
  if (resumo.percentualAbaixoDoEstimado !== null) partes.push(textoDaComparacaoComEstimado(resumo.percentualAbaixoDoEstimado))
  return partes.join(' · ')
}

export function formatarDocumentoDoFornecedor(ni: string | null | undefined): string | null {
  if (!ni) return null
  const digitos = ni.replace(/\D/g, '')
  if (digitos.length === 14) return `${digitos.slice(0, 2)}.${digitos.slice(2, 5)}.${digitos.slice(5, 8)}/${digitos.slice(8, 12)}-${digitos.slice(12)}`
  if (digitos.length === 11) return `***.${digitos.slice(3, 6)}.${digitos.slice(6, 9)}-**`
  return ni
}

export function porteDeMicroOuPequena(porte: string | null | undefined): 'ME' | 'EPP' | null {
  if (!porte) return null
  const texto = semAcento(porte)
  if (texto === 'me' || texto.includes('microempresa')) return 'ME'
  if (texto === 'epp' || texto.includes('pequeno porte')) return 'EPP'
  return null
}

export function textoDosOutrosFornecedores(fornecedoresRegistrados: number | null | undefined): string | null {
  const outros = (fornecedoresRegistrados ?? 0) - 1
  if (outros < 1) return null
  return outros === 1 ? 'e mais 1 fornecedor registrado' : `e mais ${outros} fornecedores registrados`
}

export function textoDosItensHomologados(quantidade: number): string {
  return quantidade === 1 ? 'Resultado: 1 item homologado' : `Resultado: ${quantidade} itens homologados`
}

export function mostraResultado(tender: { fonte: string; encerramentoAt?: string | null }, agora: Date = new Date()): boolean {
  if (tender.fonte !== 'PNCP' || !tender.encerramentoAt) return false
  const fim = Date.parse(tender.encerramentoAt)
  return Number.isFinite(fim) && fim < agora.getTime()
}
