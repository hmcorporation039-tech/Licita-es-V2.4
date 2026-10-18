import { readFileSync } from 'node:fs'
import { join } from 'node:path'

export const PASTA_DO_TCE_TO = join(__dirname, '..', 'fixtures', 'tce-to')

export function arquivoDoTceTo(nome: string): string {
  return readFileSync(join(PASTA_DO_TCE_TO, nome), 'utf8')
}

export type ItemDaListaTceTo = Record<string, unknown> & { idProcedimento: number }

export function itensReaisDoTceTo(): ItemDaListaTceTo[] {
  return (JSON.parse(arquivoDoTceTo('lista-abertura-futura.json')) as { raiz: ItemDaListaTceTo[] }).raiz
}

export function itemReal(idProcedimento: number): ItemDaListaTceTo {
  const item = itensReaisDoTceTo().find((i) => i.idProcedimento === idProcedimento)
  if (!item) throw new Error(`procedimento ${idProcedimento} fora da fixture`)
  return { ...item }
}

export function itemFalso(idProcedimento: number, campos: Record<string, unknown> = {}): ItemDaListaTceTo {
  return {
    idProcedimento,
    cnpjuni: '01000000000100',
    nomeuni: 'PREFEITURA MUNICIPAL DE TAGUATINGA',
    tipoProcedimento: 'Licitação',
    numProcessoAdministrativo: String(1000 + idProcedimento),
    anoProcessoAdministrativo: 2026,
    numeroLicitatorio: idProcedimento,
    anoLicitatorio: 2026,
    fases: '1ªF',
    valorEstimado: '1000.00',
    dataCadastroProcedimento: '10/10/2026',
    dataAberturaEvento: '05/11/2026',
    primeiraPublicacao: '09/10/2026',
    objeto: `Aquisição do material número ${idProcedimento}`,
    codmunicipio: 1720903,
    codesfera: 2,
    codrelatoria: 4,
    modalidade: 'Pregão Eletrônico',
    isregistropreco: 0,
    esdispensaeletronica: 0,
    situacao_2fase: '',
    ativoProcedimento: 1,
    sigiloso: false,
    iscredenciamento: 0,
    ...campos,
  }
}

export function listaJson(itens: ItemDaListaTceTo[], total = itens.length): string {
  return JSON.stringify({ success: true, raiz: itens, total })
}

export function detalheJson(idProcedimento: number, campos: { situacao2Fase?: string | null; ativo?: boolean; veiculos?: string[] } = {}): string {
  return JSON.stringify({
    success: true,
    raiz: {
      DadosUnidadeGestora: { nomeunidadegestora: 'PREFEITURA MUNICIPAL DE TAGUATINGA', procedimentoAtivo: campos.ativo ?? true },
      situacao2Fase: campos.situacao2Fase ?? null,
      Licitacoes: { idProcedimento: String(idProcedimento), modalidade: 'Pregão Eletrônico', dataAberturaEvento: '05/11/26', linksessao: '', situacao: '', TipoLicitacao: 'Menor Preço' },
      Publicacoes: { resposta: (campos.veiculos ?? ['Diário Oficial']).map((v) => ({ idveiculopublicacao: v, datapublicacao: '09/10/2026', complemento: '-', ativo: 1 })), total: '1' },
      ProcedimentoNatureza: { resposta: [], total: '0' },
    },
  })
}

export function erroHttpTceTo(status: number | undefined): Error {
  return Object.assign(new Error(status ? `HTTP ${status}` : 'socket hang up'), {
    isAxiosError: true,
    ...(status ? { response: { status } } : { code: 'ECONNRESET' }),
  })
}
