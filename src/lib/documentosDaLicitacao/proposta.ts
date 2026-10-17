import { formatarReais, inteiroPorExtenso, reaisPorExtenso } from './extenso'
import { localEData } from './proponente'
import { marcador, type Bloco, type Certame, type DocumentoDaLicitacao, type Proponente } from './modelo'

export interface ItemDaProposta {
  numero: number | null
  descricao: string
  unidade: string | null
  quantidade: number
  precoUnitario: number | null
}

export interface OpcoesDaProposta {
  validadeDias: number
  prazoDeEntrega: string
  condicoesDePagamento: string
  lanceFinal?: number
}

export interface PropostaGerada {
  documento: DocumentoDaLicitacao
  pendencias: string[]
  total: number
}

const arred = (n: number) => Math.round(n * 100) / 100

export function propostaComercial(
  proponente: Proponente,
  certame: Certame,
  itens: ItemDaProposta[],
  opcoes: OpcoesDaProposta,
  quando: Date = new Date(),
): PropostaGerada {
  const pendencias = [...proponente.pendencias]
  const semPreco = itens.filter((i) => i.precoUnitario === null || arred(i.precoUnitario) <= 0)
  if (semPreco.length > 0) pendencias.push(`preço de venda de ${semPreco.length} item(ns) no estudo de custos`)

  let total = 0
  const linhas = itens.map((item, i) => {
    const unitario = item.precoUnitario !== null ? arred(item.precoUnitario) : 0
    const temPreco = unitario > 0
    const subtotal = temPreco ? arred(unitario * item.quantidade) : 0
    total = arred(total + subtotal)
    return [
      String(item.numero ?? i + 1),
      item.descricao,
      item.unidade ?? 'un',
      item.quantidade.toLocaleString('pt-BR'),
      temPreco ? formatarReais(unitario) : marcador('preço'),
      temPreco ? formatarReais(subtotal) : marcador('total'),
    ]
  })

  const readequada = opcoes.lanceFinal !== undefined
  const sessao = certame.sessao ? (readequada ? `, cuja sessão pública foi realizada em ${certame.sessao}` : `, cuja sessão pública está marcada para ${certame.sessao}`) : ''
  const blocos: Bloco[] = [
    { tipo: 'titulo', texto: readequada ? 'PROPOSTA COMERCIAL READEQUADA' : 'PROPOSTA COMERCIAL' },
    { tipo: 'paragrafo', texto: `Ao(À) ${certame.orgao}` },
    { tipo: 'paragrafo', texto: `Referência: ${certame.referencia}${sessao}.` },
    ...(readequada
      ? [{ tipo: 'paragrafo' as const, texto: `Proposta readequada ao valor final de R$ ${formatarReais(opcoes.lanceFinal!)} (${reaisPorExtenso(opcoes.lanceFinal!)}), ofertado na etapa de lances, com os preços unitários ajustados proporcionalmente.${total < opcoes.lanceFinal! ? ` Como os preços unitários são arredondados para centavos, o valor global readequado é de R$ ${formatarReais(total)} (${reaisPorExtenso(total)}), R$ ${formatarReais(arred(opcoes.lanceFinal! - total))} abaixo do lance ofertado, sem ultrapassá-lo.` : ''}` }]
      : []),
    { tipo: 'paragrafo', texto: `Objeto: ${certame.objeto}` },
    {
      tipo: 'paragrafo',
      texto: `${proponente.qualificacao}, apresenta a seguinte proposta comercial para o objeto em referência, nas condições estabelecidas no edital e em seus anexos:`,
    },
    {
      tipo: 'tabela',
      colunas: ['Item', 'Descrição', 'Unid.', 'Qtd.', 'Valor unitário (R$)', 'Valor total (R$)'],
      linhas,
      rodape: ['', 'VALOR GLOBAL DA PROPOSTA', '', '', '', formatarReais(total)],
      alinharDireita: [3, 4, 5],
    },
    { tipo: 'paragrafo', texto: `Valor global da proposta: R$ ${formatarReais(total)} (${reaisPorExtenso(total)}).` },
    { tipo: 'paragrafo', texto: `Validade da proposta: ${opcoes.validadeDias} (${inteiroPorExtenso(opcoes.validadeDias)}) dias, contados da data da sessão pública.` },
    { tipo: 'paragrafo', texto: `Prazo de entrega/execução: ${opcoes.prazoDeEntrega || 'conforme o edital e o termo de referência'}.` },
    { tipo: 'paragrafo', texto: `Condições de pagamento: ${opcoes.condicoesDePagamento || 'conforme o edital'}.` },
    {
      tipo: 'paragrafo',
      texto:
        'Declaramos que nos preços propostos estão incluídos todos os custos diretos e indiretos, tributos, encargos sociais, trabalhistas e previdenciários, fretes, seguros e demais despesas necessárias ao cumprimento integral do objeto, e que concordamos com todas as condições do edital.',
    },
  ]
  if (proponente.dadosBancarios) blocos.push({ tipo: 'paragrafo', texto: `Dados bancários para pagamento: ${proponente.dadosBancarios.replace(/[.\s]+$/, '')}.` })
  blocos.push({ tipo: 'assinatura', local: localEData(proponente, quando) })

  return { documento: { tipo: 'proposta', titulo: readequada ? 'Proposta comercial readequada' : 'Proposta comercial', blocos }, pendencias, total }
}

const COLUNA_QUANTIDADE = 'Qtd.'
const COLUNA_UNITARIO = 'Valor unitário (R$)'
const COLUNA_TOTAL = 'Valor total (R$)'
const PARAGRAFO_DO_VALOR_GLOBAL = /^Valor global da proposta: R\$ [\d.,]+ \([^)]*\)\.$/

export function lerValorDaCelula(texto: string): number | null {
  let t = texto.replace(/R\$/g, '').replace(/\s/g, '')
  if (!/^\d[\d.,]*$/.test(t)) return null
  if (t.includes(',')) t = t.replace(/\./g, '').replace(',', '.')
  else if (!/^\d+\.\d{1,2}$/.test(t) && !/^0\.\d+$/.test(t)) t = t.replace(/\./g, '')
  const n = Number(t)
  return Number.isFinite(n) ? n : null
}

export function recalcularProposta(documento: DocumentoDaLicitacao, opcoes: { normalizarUnitarios: boolean }): { documento: DocumentoDaLicitacao; total: number | null } {
  if (documento.tipo !== 'proposta') return { documento, total: null }
  const somas: number[] = []
  const blocos = documento.blocos.map((bloco): Bloco => {
    if (bloco.tipo !== 'tabela') return bloco
    const iQtd = bloco.colunas.indexOf(COLUNA_QUANTIDADE)
    const iUnit = bloco.colunas.indexOf(COLUNA_UNITARIO)
    const iTotal = bloco.colunas.indexOf(COLUNA_TOTAL)
    if (iQtd < 0 || iUnit < 0 || iTotal < 0) return bloco
    let soma = 0
    const linhas = bloco.linhas.map((linha) => {
      const quantidade = lerValorDaCelula(linha[iQtd] ?? '')
      const unitario = lerValorDaCelula(linha[iUnit] ?? '')
      const nova = [...linha]
      if (quantidade === null || unitario === null || arred(unitario) <= 0) {
        nova[iTotal] = marcador('total')
        return nova
      }
      const subtotal = arred(arred(unitario) * quantidade)
      soma = arred(soma + subtotal)
      nova[iTotal] = formatarReais(subtotal)
      if (opcoes.normalizarUnitarios) nova[iUnit] = formatarReais(arred(unitario))
      return nova
    })
    somas.push(soma)
    const rodape = bloco.rodape && bloco.rodape.length > iTotal ? bloco.rodape.map((c, j) => (j === iTotal ? formatarReais(soma) : c)) : bloco.rodape
    return { ...bloco, linhas, ...(rodape ? { rodape } : {}) }
  })
  if (somas.length === 0) return { documento, total: null }
  const valorGlobal = arred(somas.reduce((a, b) => a + b, 0))
  const comTexto = blocos.map((bloco): Bloco =>
    bloco.tipo === 'paragrafo' && PARAGRAFO_DO_VALOR_GLOBAL.test(bloco.texto.trim())
      ? { tipo: 'paragrafo', texto: `Valor global da proposta: R$ ${formatarReais(valorGlobal)} (${reaisPorExtenso(valorGlobal)}).` }
      : bloco,
  )
  return { documento: { ...documento, blocos: comTexto }, total: valorGlobal }
}
