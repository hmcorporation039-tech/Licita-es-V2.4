import { documentoParaGuardar } from './documentoDoFornecedor'
const BYTES_DO_CP1252: Record<string, number> = {
  '€': 0x80,
  '‚': 0x82,
  'ƒ': 0x83,
  '„': 0x84,
  '…': 0x85,
  '†': 0x86,
  '‡': 0x87,
  'ˆ': 0x88,
  '‰': 0x89,
  'Š': 0x8a,
  '‹': 0x8b,
  'Œ': 0x8c,
  'Ž': 0x8e,
  '‘': 0x91,
  '’': 0x92,
  '“': 0x93,
  '”': 0x94,
  '•': 0x95,
  '–': 0x96,
  '—': 0x97,
  '˜': 0x98,
  '™': 0x99,
  'š': 0x9a,
  '›': 0x9b,
  'œ': 0x9c,
  'ž': 0x9e,
  'Ÿ': 0x9f,
}

const CONTINUACOES_LIDAS_COMO_LATIN1 = `\u0080-¿${Object.keys(BYTES_DO_CP1252).join('')}`
const SINAL_DE_MOJIBAKE = new RegExp(`[ÂÃ][${CONTINUACOES_LIDAS_COMO_LATIN1}]`)
const DECODIFICADOR_ESTRITO = new TextDecoder('utf-8', { fatal: true })

export function repararMojibake(texto: string | null | undefined): string | null {
  if (texto === null || texto === undefined) return null
  if (!SINAL_DE_MOJIBAKE.test(texto)) return texto
  const bytes: number[] = []
  for (const caractere of texto) {
    const codigo = caractere.codePointAt(0) ?? 0
    const byte = codigo <= 0xff ? codigo : BYTES_DO_CP1252[caractere]
    if (byte === undefined) return texto
    bytes.push(byte)
  }
  try {
    return DECODIFICADOR_ESTRITO.decode(Uint8Array.from(bytes))
  } catch {
    return texto
  }
}

function semAcento(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim()
}

function numeroOuNulo(valor: unknown): number | null {
  if (valor === null || valor === undefined || valor === '') return null
  const numero = typeof valor === 'number' ? valor : Number(valor)
  return Number.isFinite(numero) ? numero : null
}

export interface ItemDaCompraPncp {
  numeroItem: number
  temResultado?: boolean | null
  situacaoCompraItem?: number | null
  situacaoCompraItemNome?: string | null
  valorUnitarioEstimado?: number | null
}

export interface ResultadoDoItemPncp {
  niFornecedor?: string | null
  tipoPessoa?: string | null
  nomeRazaoSocialFornecedor?: string | null
  numeroItem?: number | null
  valorTotalHomologado?: number | null
  quantidadeHomologada?: number | null
  valorUnitarioHomologado?: number | null
  ordemClassificacaoSrp?: number | null
  dataResultado?: string | null
  dataCancelamento?: string | null
  porteFornecedorNome?: string | null
  situacaoCompraItemResultadoId?: number | null
  situacaoCompraItemResultadoNome?: string | null
  sequencialResultado?: number | null
}

export interface VencedorDoItem {
  ni: string | null
  nome: string | null
  porte: string | null
  valorUnitarioHomologado: number | null
  quantidadeHomologada: number | null
  valorTotalHomologado: number | null
  dataDoResultado: Date | null
  fornecedoresRegistrados: number
}

const DATA_VAZIA_DO_PNCP = '0001-01-01'
const ID_DO_RESULTADO_INFORMADO = 1
const ID_DO_ITEM_EM_ANDAMENTO = 1

export function resultadoCancelado(resultado: ResultadoDoItemPncp): boolean {
  const cancelamento = resultado.dataCancelamento?.trim()
  if (cancelamento && !cancelamento.startsWith(DATA_VAZIA_DO_PNCP)) return true
  const situacao = repararMojibake(resultado.situacaoCompraItemResultadoNome)?.trim()
  if (situacao) return semAcento(situacao) !== 'informado'
  const id = resultado.situacaoCompraItemResultadoId
  return id !== null && id !== undefined && id !== ID_DO_RESULTADO_INFORMADO
}

function posicaoNaClassificacao(valor: number | null | undefined): number {
  const numero = numeroOuNulo(valor)
  return numero === null ? Number.POSITIVE_INFINITY : numero
}

function dataDoDia(texto: string | null | undefined): Date | null {
  const dia = texto?.match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!dia || dia[1] === '0001') return null
  const data = new Date(`${dia[1]}-${dia[2]}-${dia[3]}T00:00:00.000Z`)
  return Number.isNaN(data.getTime()) ? null : data
}

function textoLimpo(texto: string | null | undefined): string | null {
  const reparado = repararMojibake(texto)?.trim()
  return reparado ? reparado : null
}

export function escolherVencedor(resultados: ResultadoDoItemPncp[]): VencedorDoItem | null {
  const ativos = resultados.filter((r) => r && typeof r === 'object' && !resultadoCancelado(r))
  if (ativos.length === 0) return null
  const ordenados = [...ativos].sort(
    (a, b) =>
      posicaoNaClassificacao(a.ordemClassificacaoSrp) - posicaoNaClassificacao(b.ordemClassificacaoSrp) ||
      posicaoNaClassificacao(a.sequencialResultado) - posicaoNaClassificacao(b.sequencialResultado)
  )
  const vencedor = ordenados[0]
  const fornecedores = new Set(ativos.map((r, indice) => r.niFornecedor?.trim() || `sem-identificacao-${indice}`))
  return {
    ni: documentoParaGuardar(vencedor.niFornecedor),
    nome: textoLimpo(vencedor.nomeRazaoSocialFornecedor),
    porte: textoLimpo(vencedor.porteFornecedorNome),
    valorUnitarioHomologado: numeroOuNulo(vencedor.valorUnitarioHomologado),
    quantidadeHomologada: numeroOuNulo(vencedor.quantidadeHomologada),
    valorTotalHomologado: numeroOuNulo(vencedor.valorTotalHomologado),
    dataDoResultado: dataDoDia(vencedor.dataResultado),
    fornecedoresRegistrados: fornecedores.size,
  }
}

export function situacaoDoItem(item: Pick<ItemDaCompraPncp, 'situacaoCompraItemNome'>): string | null {
  return textoLimpo(item.situacaoCompraItemNome)
}

export function itemEmAndamento(situacao: string | null, idDaSituacao?: number | null): boolean {
  if (situacao) return semAcento(situacao) === 'em andamento'
  return idDaSituacao === null || idDaSituacao === undefined || idDaSituacao === ID_DO_ITEM_EM_ANDAMENTO
}

export function itemHomologado(situacao: string | null | undefined): boolean {
  return !!situacao && semAcento(situacao) === 'homologado'
}

export function itemCancelado(situacao: string | null | undefined): boolean {
  return !!situacao && /anulad|revogad|cancelad/.test(semAcento(situacao))
}

export interface ItemParaFinalizar {
  situacao: string | null
  idDaSituacao?: number | null
  noBanco: boolean
  temVencedor: boolean
  valorTotalHomologado: number | null
}

export interface Finalizacao {
  final: boolean
  homologados: number
  somaHomologada: number | null
}

export function avaliarFinalizacao(itens: ItemParaFinalizar[]): Finalizacao {
  if (itens.length === 0) return { final: false, homologados: 0, somaHomologada: null }
  const todosEmSituacaoFinal = itens.every((i) => !itemEmAndamento(i.situacao, i.idDaSituacao))
  const homologados = itens.filter((i) => itemHomologado(i.situacao))
  const faltaVencedor = homologados.some((i) => i.noBanco && !i.temVencedor)
  const valores = homologados.map((i) => i.valorTotalHomologado).filter((v): v is number => v !== null && v > 0)
  const somaHomologada = valores.length > 0 ? Math.round(valores.reduce((total, v) => total + v, 0) * 100) / 100 : null
  return { final: todosEmSituacaoFinal && !faltaVencedor, homologados: homologados.length, somaHomologada }
}
