// Formato do estudo de custos (espelha src/lib/estudoDeCustos.ts da API).

export interface MercadoDoItem {
  mediana: number
  minimo: number
  maximo: number
  amostras: number
  uf: string | null
  meses: number
  consultadoEm: string
  unidade?: string | null
  unidadeConfere?: boolean | null
}

export type FonteDoCusto = 'COTACAO' | 'BASE' | 'MERCADO' | 'ESTIMATIVA'

export const ROTULO_DA_FONTE: Record<FonteDoCusto, string> = {
  COTACAO: 'Cotação de fornecedor',
  BASE: 'Minha base de preços',
  MERCADO: 'Preço de mercado',
  ESTIMATIVA: 'Estimativa',
}

export interface ContratoDoEstudo {
  tipo: 'unico' | 'continuo'
  vigenciaMeses: number
  mesesSemFaturar: number
}

export const CONTRATO_PADRAO: ContratoDoEstudo = { tipo: 'unico', vigenciaMeses: 12, mesesSemFaturar: 0 }

export interface ItemDoEstudoDigitado {
  custoUnit: number | null
  precoVendaUnit: number | null
  fonteDoCusto?: FonteDoCusto | null
}

export interface DadosDoEstudo {
  versao: 1
  itens: Record<string, ItemDoEstudoDigitado>
  mercado: Record<string, MercadoDoItem>
  deslocamento: {
    kmIdaInformado: number | null
    viagens: number
    valorPorKm: number
    precoLitro: number
    consumoKmPorLitro: number
    pedagioPorViagem: number
    hospedagemPorViagem: number
  }
  impostosPct: number
  margemDesejadaPct: number
  outrosCustos: { descricao: string; valor: number; tipo?: 'unico' | 'mensal' }[]
  contrato?: ContratoDoEstudo
  prazo: { exigidoDias: number | null; exigidoEmDiasUteis: boolean; preparoDias: number; assinatura: string | null }
}

export interface ItemDoEstudo {
  id: string
  numero: number | null
  descricao: string
  unidade: string | null
  quantidade: number
  valorEstimadoUnit: number | null
  codigoCatalogo: string | null
  tipoCatalogo: 'MATERIAL' | 'SERVICO' | null
  quantidadeAssumida?: boolean
}

export interface ResultadoDoEstudo {
  receita: number
  custoItens: number
  custoDeslocamento: number
  custoOutros: number
  impostos: number
  custosSemImpostos: number
  custoTotal: number
  lucro: number
  margemPct: number | null
  receitaMinima: number | null
  estimadoPeloOrgao: number | null
  resultadoNoEstimado: number | null
  itens: { id: string; custo: number; venda: number; precoMinimoUnit: number | null; lucro: number | null; margemPct: number | null; prejuizo: boolean }[]
  deslocamento: {
    origem: 'estimado' | 'informado' | 'indisponivel'
    kmIda: number | null
    kmIdaEVolta: number | null
    litrosPorViagem: number | null
    combustivelPorViagem: number
    custoPorViagem: number
  }
  cenarios: { nome: string; receita: number; lucro: number; margemPct: number | null }[]
  contrato: {
    vigenciaMeses: number
    mesesFaturados: number
    receitaMensal: number
    custoMensal: number
    impostosMensais: number
    lucroMensal: number
    custosUnicos: number
    custosUnicosPorMes: number | null
    mesesParaRecuperar: number | null
  } | null
  negociacao: {
    receitaReferencia: number
    origemDaReferencia: 'seus_precos' | 'estimado_orgao'
    custoAtual: number
    custoDeEquilibrio: number
    tetos: { margemPct: number; custoMaximo: number; folga: number; custoMaximoMensal: number | null }[]
    lances: { descontoPct: number; receita: number; lucro: number; margemPct: number | null }[]
    descontoMaximoSemPrejuizo: number | null
  } | null
  origemDosCustos: { firme: number; referencia: number; estimativa: number; semOrigem: number; pctSemCotacao: number | null }
  prazo: {
    situacao: 'ok' | 'apertado' | 'inviavel' | null
    diasNecessarios: number
    diasDeTransporte: number
    folgaDias: number | null
    dataLimite: string | null
    dataEntregaPrevista: string | null
  }
  avisos: string[]
}

export interface EstudoResposta {
  tender: {
    id: string
    objeto: string
    orgao: string | null
    municipio: string | null
    uf: string | null
    valorEstimado: number | null
    encerramentoAt: string | null
    aberturaAt: string | null
    fonte: string
    modalidade: string
    linkEdital: string | null
  }
  itens: ItemDoEstudo[]
  dados: DadosDoEstudo
  base: { municipio: string | null; uf: string | null; definida: boolean }
  distanciaLinhaRetaKm: number | null
  destino?: { municipio: string | null; uf: string | null; origem: 'edital' | 'objeto' | 'orgao' } | null
  prazoDoEdital: string | null
  resultado: ResultadoDoEstudo
  salvoEm: string | null
}

export interface PesquisaDePrecosResposta {
  itemId: string
  totalDeCompras: number
  estatisticas: { amostras: number; descartados: number; minimo: number; p25: number; mediana: number; p75: number; maximo: number; media: number } | null
  unidade: string | null
  unidadeConfere: boolean | null
  unidades: { unidade: string | null; amostras: number }[]
  recentes: { precoUnitario: number; data: string | null; orgao: string | null; uf: string | null; fornecedor: string | null; unidade: string | null }[]
  consultadoEm: string
  filtro: { uf: string | null; meses: number }
}
