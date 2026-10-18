import { describe, expect, it } from 'vitest'
import { DatasDaLicitacao, estaAberta } from '../src/lib/licitacaoAberta'
import { prazoImprovavel } from '../src/lib/dataPlausivel'
import {
  AvisoDeOutraFonte,
  LicitacaoDoPncpComparavel,
  comparacaoDoNumeroDoAviso,
  conflitoComOPncp,
  entidadeDoOrgao,
  numerosDoTexto,
  numeroDoAviso,
  orgaosConflitam,
  podeEsconderComoRepeticao,
} from '../src/lib/repeticaoDoPncp'
import { comparacaoDoNumeroTceCe } from '../src/services/tceCeDuplicidade'
import { objetoSemConteudo } from '../src/services/queridoDiarioParser'
import { whereDoMunicipio } from '../src/services/buscaDeLicitacoes'
import { versaoDoPncp } from '../web/src/lib/licitacaoNaTela'

const AGORA = new Date('2026-10-18T12:00:00-03:00')
const dia = (texto: string) => new Date(`${texto}T09:00:00-03:00`)
const dias = (n: number) => new Date(AGORA.getTime() + n * 86_400_000)

function esconde(aviso: AvisoDeOutraFonte & { fonteId: string }, pncp: LicitacaoDoPncpComparavel & { numeroCompra?: string; anoCompra?: string }): boolean {
  return podeEsconderComoRepeticao(aviso, pncp, comparacaoDoNumeroDoAviso(numeroDoAviso(aviso.fonteId), pncp))
}

describe('N18: só esconde a repetição do PNCP sem nenhum conflito e com sinal que confirme', () => {
  it('Paranhos/MS: pregão presencial 49 de ferramentas (sessão 26/10) não é o PE 07 de ferros (29/10), mesmo com objeto 0,46 parecido', () => {
    const aviso = { fonte: 'QUERIDO_DIARIO' as const, fonteId: 'QD-5006358:PREGAO:49-2026', modalidade: 'PREGAO_PRESENCIAL' as const, aberturaAt: dia('2026-10-26'), orgao: 'Prefeitura Municipal de Paranhos', municipio: 'Paranhos' }
    const pncp = { modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: dia('2026-10-16'), encerramentoAt: dia('2026-10-29'), orgao: 'MUNICIPIO DE PARANHOS', similaridade: 0.46, numeroCompra: '07', anoCompra: '2026' }
    expect(conflitoComOPncp(aviso, pncp, comparacaoDoNumeroDoAviso(numeroDoAviso(aviso.fonteId), pncp))).toBe('numero')
    expect(esconde(aviso, pncp)).toBe(false)
    expect(esconde(aviso, { ...pncp, numeroCompra: undefined })).toBe(false)
  })

  it('Salvador/BA: "Banda no Baile das Atrizes" não é a "carga e descarga do Carnaval" do Estado, mesmo no mesmo dia', () => {
    const aviso = { fonte: 'QUERIDO_DIARIO' as const, fonteId: 'QD-2927408:PREGAO:12-2026', modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: dia('2026-11-04'), orgao: 'Prefeitura Municipal de Salvador', municipio: 'Salvador' }
    const pncp = { modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: dia('2026-10-29'), encerramentoAt: dia('2026-11-04'), orgao: 'ESTADO DA BAHIA', similaridade: 0.24, numeroCompra: 'SGTO/01/26', anoCompra: '2026' }
    expect(esconde(aviso, pncp)).toBe(false)
    expect(esconde(aviso, { ...pncp, similaridade: 0.95 })).toBe(false)
    expect(esconde(aviso, { ...pncp, orgao: 'MUNICIPIO DE SALVADOR', numeroCompra: '12', similaridade: 0.24 })).toBe(false)
  })

  it('Campinas/SP: dispensa 19 de seguro de veículos não é a dispensa 19 da FUMEC (outro órgão da cidade)', () => {
    const aviso = { fonte: 'QUERIDO_DIARIO' as const, fonteId: 'QD-3509502:DISPENSA:19-2026', modalidade: 'DISPENSA_SEM_DISPUTA' as const, aberturaAt: null, orgao: 'Prefeitura Municipal de Campinas', municipio: 'Campinas' }
    const pncp = { modalidade: 'DISPENSA_SEM_DISPUTA' as const, aberturaAt: null, encerramentoAt: null, orgao: 'FUNDACAO MUNICIPAL PARA EDUCACAO COMUNITARIA-FUMEC-', similaridade: 0.13, numeroCompra: '19', anoCompra: '2026' }
    expect(esconde(aviso, pncp)).toBe(false)
    expect(esconde(aviso, { ...pncp, similaridade: 0.8 })).toBe(false)
  })

  it('a mesma licitação nas duas fontes continua escondida', () => {
    const mossoro = { fonte: 'QUERIDO_DIARIO' as const, fonteId: 'QD-2408003:PREGAO:20-2026', modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: dia('2026-10-29'), orgao: 'Prefeitura Municipal de Mossoró', municipio: 'Mossoró' }
    expect(esconde(mossoro, { modalidade: 'PREGAO_ELETRONICO', aberturaAt: dia('2026-10-19'), encerramentoAt: dia('2026-10-29'), orgao: 'MUNICIPIO DE MOSSORO', similaridade: 0.62, numeroCompra: '20', anoCompra: '2026' })).toBe(true)
    const santos = { fonte: 'QUERIDO_DIARIO' as const, fonteId: 'QD-3548500:PREGAO:29-2026:CAMARA', modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: dia('2026-10-28'), orgao: 'Câmara Municipal de Santos', municipio: 'Santos' }
    expect(esconde(santos, { modalidade: 'PREGAO_ELETRONICO', aberturaAt: dia('2026-10-19'), encerramentoAt: dia('2026-10-28'), orgao: 'CAMARA MUNICIPAL DE SANTOS', similaridade: 0.69, numeroCompra: '000029', anoCompra: '2026' })).toBe(true)
    const guaraquecaba = { fonte: 'DIARIO_MUNICIPAL' as const, fonteId: 'DM-4109500:CREDENCIAMENTO:13-2026', modalidade: 'CREDENCIAMENTO' as const, aberturaAt: dia('2026-10-26'), orgao: 'Prefeitura Municipal de Guaraqueçaba', municipio: 'Guaraqueçaba' }
    expect(esconde(guaraquecaba, { modalidade: 'INEXIGIBILIDADE', aberturaAt: dia('2026-10-27'), encerramentoAt: null, orgao: 'MUNICIPIO DE GUARAQUECABA', similaridade: 1, numeroCompra: '37', anoCompra: '2026' })).toBe(true)
    const semData = { fonte: 'DIARIO_MUNICIPAL' as const, fonteId: 'DM-2414506:PREGAO:11-2026', modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: null, orgao: 'Prefeitura Municipal de Umarizal', municipio: 'Umarizal' }
    expect(esconde(semData, { modalidade: 'PREGAO_ELETRONICO', aberturaAt: dia('2026-10-14'), encerramentoAt: dia('2026-10-29'), orgao: 'MUNICIPIO DE UMARIZAL', similaridade: 0.41, numeroCompra: '11', anoCompra: '2026' })).toBe(true)
  })

  it('objeto parecido sem número nem dia que confirme precisa de semelhança muito alta', () => {
    const aviso = { fonte: 'QUERIDO_DIARIO' as const, fonteId: 'QD-1:PREGAO', modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: null, orgao: null, municipio: 'X' }
    const pncp = { modalidade: 'PREGAO_ELETRONICO' as const, aberturaAt: null, encerramentoAt: null, orgao: null, similaridade: 0.55 }
    expect(esconde(aviso, pncp)).toBe(false)
    expect(esconde(aviso, { ...pncp, similaridade: 0.7 })).toBe(true)
  })

  it('número: ignora o ano, aceita zeros e prefixos e reconhece número diferente', () => {
    expect(numerosDoTexto('SGTO/01/26', '2026')).toEqual([1])
    expect(numerosDoTexto('26/2026', '2026')).toEqual([26])
    expect(numerosDoTexto('PE 1.234/2026', '2026')).toEqual([1234])
    const aviso = numeroDoAviso('QD-1:DISPENSA:364-2026')
    expect(comparacaoDoNumeroDoAviso(aviso, { numeroCompra: 'Rep 364', anoCompra: 2026 })).toBe('igual')
    expect(comparacaoDoNumeroDoAviso(aviso, { numeroCompra: '364', anoCompra: 2025 })).toBe('diferente')
    expect(comparacaoDoNumeroDoAviso(aviso, { numeroCompra: '365', anoCompra: 2026 })).toBe('diferente')
    expect(comparacaoDoNumeroDoAviso(aviso, { numeroCompra: null, anoCompra: 2026 })).toBe('desconhecido')
    expect(comparacaoDoNumeroDoAviso(null, { numeroCompra: '364', anoCompra: 2026 })).toBe('desconhecido')
  })

  it('órgão: "Prefeitura", "Município" e o fundo municipal são o mesmo; Câmara, Estado e autarquia não', () => {
    expect(entidadeDoOrgao('Prefeitura Municipal de São Paulo', 'São Paulo')?.tipo).toBe('prefeitura')
    expect(orgaosConflitam('Prefeitura Municipal de Rio Claro', 'MUNICIPIO DE RIO CLARO', 'Rio Claro')).toBe(false)
    expect(orgaosConflitam('Prefeitura de Pitanga', 'FUNDO MUNICIPAL DE SAUDE DE PITANGA', 'Pitanga')).toBe(false)
    expect(orgaosConflitam('Câmara Municipal de Paulínia faz saber que se acha aberto o Pregão', 'CAMARA MUNICIPAL DE PAULINIA', 'Paulínia')).toBe(false)
    expect(orgaosConflitam('Câmara Municipal de Santos', 'MUNICIPIO DE SANTOS', 'Santos')).toBe(true)
    expect(orgaosConflitam('Prefeitura Municipal de Araçatuba', 'DEPARTAMENTO DE AGUA E ESGOTO DE ARACATUBA', 'Araçatuba')).toBe(true)
    expect(orgaosConflitam('Prefeitura Municipal de Palmas', 'CONSELHO REGIONAL DE ADMINISTRACAO DE TOCANTINS', 'Palmas')).toBe(true)
    expect(orgaosConflitam('Consórcio Intermunicipal Multifinalitário D', 'CONSORCIO INTERMUNICIPAL MULTIFINALITARIO DA MICRORREGIAO DO ALTO SAPUCAI - CIMASP', 'Pouso Alegre')).toBe(false)
    expect(orgaosConflitam(null, 'ESTADO DA BAHIA', 'Salvador')).toBe(false)
  })

  it('TCE-CE: número no formato do Ceará só conflita quando nem o final bate', () => {
    const tce = { aberturaAt: undefined, publicadoAt: new Date('2026-10-10T12:00:00Z') }
    expect(comparacaoDoNumeroTceCe(tce, new Set(['4.27']), { numeroCompra: '04.027/2026PE', processo: null })).toBe('igual')
    expect(comparacaoDoNumeroTceCe(tce, new Set(['8.13']), { numeroCompra: '013', processo: null })).toBe('desconhecido')
    expect(comparacaoDoNumeroTceCe(tce, new Set(['10.6.1']), { numeroCompra: '2026.03.26.003', processo: null })).toBe('diferente')
  })
})

describe('N17: prazo de proposta com ano digitado errado não deixa a licitação aberta até 2029', () => {
  const base = (o: Partial<DatasDaLicitacao>): DatasDaLicitacao => ({
    fonte: 'PNCP', modalidade: 'PREGAO_ELETRONICO', situacao: 'ABERTA', valorHomologado: null, encerramentoAt: null, aberturaAt: null, publicadoAt: dias(-5), createdAt: dias(-5), ...o,
  })

  it('pregão publicado em 12/02/2026 com prazo em 05/03/2029 é tratado como sem prazo e fechado pela regra dos 30 dias', () => {
    const pregao = base({ publicadoAt: new Date('2026-02-12T12:00:00-03:00'), aberturaAt: new Date('2026-02-12T12:00:00-03:00'), encerramentoAt: new Date('2029-03-05T09:00:00-03:00') })
    expect(prazoImprovavel(pregao)).toBe(true)
    expect(estaAberta(pregao, AGORA)).toBe(false)
  })

  it('SAAE com abertura em 10/09/2026 e prazo em 24/09/2029 também, e só fica aberto enquanto a publicação é recente', () => {
    const saae = base({ modalidade: 'DISPENSA_COM_DISPUTA', aberturaAt: new Date('2026-09-10T08:00:00-03:00'), publicadoAt: dias(-3), encerramentoAt: new Date('2029-09-24T08:00:00-03:00') })
    expect(prazoImprovavel(saae)).toBe(true)
    expect(estaAberta(saae, AGORA)).toBe(true)
    expect(estaAberta({ ...saae, publicadoAt: dias(-40) }, AGORA)).toBe(false)
  })

  it('credenciamento e inexigibilidade mantêm o prazo longo; prazo competitivo dentro de 12 meses continua valendo', () => {
    expect(estaAberta(base({ modalidade: 'CREDENCIAMENTO', publicadoAt: dias(-10), encerramentoAt: dias(3650) }), AGORA)).toBe(true)
    expect(estaAberta(base({ modalidade: 'INEXIGIBILIDADE', publicadoAt: dias(-10), encerramentoAt: dias(900) }), AGORA)).toBe(true)
    expect(estaAberta(base({ modalidade: 'CONCORRENCIA', publicadoAt: dias(-40), encerramentoAt: dias(300) }), AGORA)).toBe(true)
    expect(estaAberta(base({ modalidade: 'CONCORRENCIA', publicadoAt: dias(-40), encerramentoAt: dias(400) }), AGORA)).toBe(false)
  })

  it('publicação antiga com reabertura recente conta a partir da reabertura', () => {
    expect(estaAberta(base({ publicadoAt: dias(-400), aberturaAt: dias(-10), encerramentoAt: dias(5) }), AGORA)).toBe(true)
    expect(estaAberta(base({ publicadoAt: dias(-400), encerramentoAt: dias(5) }), AGORA)).toBe(false)
  })
})

describe('N14: aviso de diário sem objeto de verdade', () => {
  it.each([
    'Pesquisa de preço no mercado',
    'LICITAÇÃO COMPARTILHADA',
    'REPUBLICADO PÓS ALTERAÇÕES',
    'Celebrar um Termo de Fomento',
    'Contratação do objeto abaixo descrito',
  ])('"%s" não tem objeto', (objeto) => {
    expect(objetoSemConteudo(objeto)).toBe(true)
  })

  it('aviso com objeto de verdade não é escondido e o escondido não abre', () => {
    expect(objetoSemConteudo('Aquisição de cestas e aves natalinas')).toBe(false)
    expect(estaAberta({ fonte: 'QUERIDO_DIARIO', situacao: 'ABERTA', valorHomologado: null, encerramentoAt: null, aberturaAt: dias(5), publicadoAt: dias(-1), createdAt: dias(-1), motivoOculta: 'SEM_OBJETO' }, AGORA)).toBe(false)
  })
})

describe('N23: filtro de município pelo nome inteiro', () => {
  it('compara o nome normalizado inteiro, sem acento nem caixa, ou o código do IBGE', () => {
    expect(whereDoMunicipio('Santa Maria')).toEqual({ municipioNorm: 'santa maria' })
    expect(whereDoMunicipio('  SÃO   Paulo ')).toEqual({ municipioNorm: 'sao paulo' })
    expect(whereDoMunicipio('4316907')).toEqual({ municipioIbge: '4316907' })
  })
})

describe('N25: aviso escondido aberto por link direto aponta para a versão do PNCP', () => {
  it('só quando há a licitação do PNCP correspondente', () => {
    expect(versaoDoPncp({ duplicataDe: 'abc-123' })).toBe('/tenders/abc-123')
    expect(versaoDoPncp({ duplicataDe: null })).toBeNull()
    expect(versaoDoPncp({})).toBeNull()
  })
})
