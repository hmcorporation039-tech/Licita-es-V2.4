import { formatarReais, reaisPorExtenso } from './extenso'
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
  const semPreco = itens.filter((i) => i.precoUnitario === null || i.precoUnitario <= 0)
  if (semPreco.length > 0) pendencias.push(`preço de venda de ${semPreco.length} item(ns) no estudo de custos`)

  let total = 0
  const linhas = itens.map((item, i) => {
    const temPreco = item.precoUnitario !== null && item.precoUnitario > 0
    const subtotal = temPreco ? arred(item.precoUnitario! * item.quantidade) : 0
    total = arred(total + subtotal)
    return [
      String(item.numero ?? i + 1),
      item.descricao,
      item.unidade ?? 'un',
      item.quantidade.toLocaleString('pt-BR'),
      temPreco ? formatarReais(item.precoUnitario!) : marcador('preço'),
      temPreco ? formatarReais(subtotal) : marcador('total'),
    ]
  })

  const sessao = certame.sessao ? `, cuja sessão pública está marcada para ${certame.sessao}` : ''
  const blocos: Bloco[] = [
    { tipo: 'titulo', texto: 'PROPOSTA COMERCIAL' },
    { tipo: 'paragrafo', texto: `Ao(À) ${certame.orgao}` },
    { tipo: 'paragrafo', texto: `Referência: ${certame.modalidade} nº ${certame.numero}${sessao}.` },
    { tipo: 'paragrafo', texto: `Objeto: ${certame.objeto}` },
    {
      tipo: 'paragrafo',
      texto: `${proponente.razaoSocial}, inscrita no ${proponente.documento}, com sede em ${proponente.endereco}, por intermédio de seu representante legal, ${proponente.responsavel}, portador(a) do CPF nº ${proponente.responsavelCpf}, apresenta a seguinte proposta comercial para o objeto em referência, nas condições estabelecidas no edital e em seus anexos:`,
    },
    {
      tipo: 'tabela',
      colunas: ['Item', 'Descrição', 'Unid.', 'Qtd.', 'Valor unitário (R$)', 'Valor total (R$)'],
      linhas,
      rodape: ['', 'VALOR GLOBAL DA PROPOSTA', '', '', '', formatarReais(total)],
      alinharDireita: [3, 4, 5],
    },
    { tipo: 'paragrafo', texto: `Valor global da proposta: R$ ${formatarReais(total)} (${reaisPorExtenso(total)}).` },
    { tipo: 'paragrafo', texto: `Validade da proposta: ${opcoes.validadeDias} (${validadePorExtenso(opcoes.validadeDias)}) dias, contados da data da sessão pública.` },
    { tipo: 'paragrafo', texto: `Prazo de entrega/execução: ${opcoes.prazoDeEntrega || 'conforme o edital e o termo de referência'}.` },
    { tipo: 'paragrafo', texto: `Condições de pagamento: ${opcoes.condicoesDePagamento || 'conforme o edital'}.` },
    {
      tipo: 'paragrafo',
      texto:
        'Declaramos que nos preços propostos estão incluídos todos os custos diretos e indiretos, tributos, encargos sociais, trabalhistas e previdenciários, fretes, seguros e demais despesas necessárias ao cumprimento integral do objeto, e que concordamos com todas as condições do edital.',
    },
  ]
  if (proponente.dadosBancarios) blocos.push({ tipo: 'paragrafo', texto: `Dados bancários para pagamento: ${proponente.dadosBancarios}.` })
  blocos.push({ tipo: 'assinatura', local: localEData(proponente, quando) })

  return { documento: { tipo: 'proposta', titulo: 'Proposta comercial', blocos }, pendencias, total }
}

function validadePorExtenso(dias: number): string {
  const nomes: Record<number, string> = { 30: 'trinta', 60: 'sessenta', 90: 'noventa', 120: 'cento e vinte', 180: 'cento e oitenta' }
  return nomes[dias] ?? String(dias)
}
