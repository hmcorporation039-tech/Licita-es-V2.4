// Formato do estudo de custos (espelha src/lib/estudoDeCustos.ts da API).

export interface MercadoDoItem {
  mediana: number
  minimo: number
  maximo: number
  amostras: number
  uf: string | null
  meses: number
  consultadoEm: string
}

export interface DadosDoEstudo {
  versao: 1
  itens: Record<string, { custoUnit: number | null; precoVendaUnit: number | null }>
  mercado: Record<string, MercadoDoItem>
  deslocamento: {
    kmIdaInformado: number | null
    viagens: number
    valorPorKm: number
    pedagioPorViagem: number
    hospedagemPorViagem: number
  }
  impostosPct: number
  margemDesejadaPct: number
  outrosCustos: { descricao: string; valor: number }[]
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
}

export interface ResultadoDoEstudo {
  receita: number
  custoItens: number
  custoDeslocamento: number
  custoOutros: number
  impostos: number
  custoTotal: number
  lucro: number
  margemPct: number | null
  receitaMinima: number | null
  itens: { id: string; custo: number; venda: number; precoMinimoUnit: number | null }[]
  deslocamento: { origem: 'estimado' | 'informado' | 'indisponivel'; kmIda: number | null; kmIdaEVolta: number | null; custoPorViagem: number }
  cenarios: { nome: string; receita: number; lucro: number; margemPct: number | null }[]
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
    modalidade: string
    linkEdital: string | null
  }
  itens: ItemDoEstudo[]
  dados: DadosDoEstudo
  base: { municipio: string | null; uf: string | null; definida: boolean }
  distanciaLinhaRetaKm: number | null
  prazoDoEdital: string | null
  resultado: ResultadoDoEstudo
  salvoEm: string | null
}

export interface PesquisaDePrecosResposta {
  itemId: string
  totalDeCompras: number
  estatisticas: { amostras: number; descartados: number; minimo: number; p25: number; mediana: number; p75: number; maximo: number; media: number } | null
  recentes: { precoUnitario: number; data: string | null; orgao: string | null; uf: string | null; fornecedor: string | null }[]
  consultadoEm: string
  filtro: { uf: string | null; meses: number }
}
