import { describe, expect, it } from 'vitest'
import {
  LinhaDaListaTceTo,
  assinaturaDaLinhaTceTo,
  caminhoDaListaTceTo,
  caminhoDoDetalheTceTo,
  diaDoTceTo,
  fonteIdTceTo,
  idDoProcedimentoTceTo,
  linhaComSessaoFutura,
  linhaMunicipal,
  modalidadeDoTceTo,
  municipioDoTocantins,
  orgaoDoTceTo,
  parseDetalheTceTo,
  parseListaTceTo,
  situacaoDoTceTo,
  tenderDoTceTo,
  textoDoTceTo,
  urlPublicaDoTceTo,
} from '../src/services/tceToParser'
import { NOMES_DOS_MUNICIPIOS_DO_TOCANTINS } from '../src/services/tceToMunicipios'
import { dataDaSessao } from '../src/lib/dataDaSessao'
import { estaAberta } from '../src/lib/licitacaoAberta'
import { ehDiaSemHoraDaLicitacao, formatarPrazoDaLicitacao } from '../src/lib/dataDeBrasilia'
import { NormalizedTender } from '../src/types'
import { arquivoDoTceTo } from './helpers/tceTo'

const AGORA = new Date('2026-10-18T15:00:00Z')
const LISTA = parseListaTceTo(arquivoDoTceTo('lista-abertura-futura.json'))

function linha(idProcedimento: number): LinhaDaListaTceTo {
  const achada = LISTA.linhas.find((l) => l.idProcedimento === idProcedimento)
  if (!achada) throw new Error(`procedimento ${idProcedimento} fora da fixture`)
  return achada
}

function licitacao(idProcedimento: number, comDetalhe = false): NormalizedTender {
  const detalhe = comDetalhe ? parseDetalheTceTo(arquivoDoTceTo(`detalhe-${idProcedimento}.json`)) : undefined
  const leitura = tenderDoTceTo(linha(idProcedimento), detalhe)
  if (leitura.tipo !== 'licitacao') throw new Error(leitura.motivo)
  return leitura.tender
}

describe('TCE-TO — lista do SICAP-LCO (fixture real de 18/10/2026)', () => {
  it('lê os 125 procedimentos com sessão de hoje em diante e o total anunciado', () => {
    expect(LISTA.total).toBe(125)
    expect(LISTA.linhas).toHaveLength(125)
    expect(LISTA.linhas.filter(linhaMunicipal)).toHaveLength(88)
    expect(new Set(LISTA.linhas.filter(linhaMunicipal).map((l) => l.codigoIbge)).size).toBe(47)
    expect(LISTA.linhas.every((l) => linhaComSessaoFutura(l, AGORA))).toBe(true)
  })

  it('monta a licitação da prefeitura com município do IBGE, sessão em dia de Brasília e número/ano', () => {
    const t = licitacao(829301)
    expect(t).toMatchObject({
      fonte: 'TCE_TO',
      fonteId: 'TCE-TO-829301',
      modalidade: 'CONCORRENCIA',
      situacao: 'ABERTA',
      srp: true,
      uf: 'TO',
      municipio: 'Taguatinga',
      municipioIbge: '1720903',
      orgao: 'Prefeitura Municipal de Taguatinga',
      orgaoCnpj: '02306900000197',
      numeroControle: '4/2026',
      valorEstimado: 992536.16,
      linkEdital: 'https://app.tceto.tc.br/lo_publico/pesquisar/detalhes?idProcedimento=829301',
    })
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-30T03:00:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-15T03:00:00.000Z')
    expect(t.encerramentoAt).toBeUndefined()
    expect(t.rawJson).toMatchObject({ idProcedimento: 829301, numero: '4/2026', processoAdministrativo: '975/2026', detalheLido: false })
    expect(t.objeto.startsWith('REGISTRO DE PREÇOS PARA FUTURA E EVENTUAL CONTRATAÇÃO DE EMPRESA PARA A EXECUÇÃO DE OBRA COMUM DE ENGENHARIA')).toBe(true)
  })

  it('limpa entidade HTML e espaço duro do objeto', () => {
    const t = licitacao(829304)
    expect(t.objeto.startsWith('FUTURA E EVENTUAL CONTRATAÇÃO DE SERVIÇOS DE HOSPEDAGEM')).toBe(true)
    expect(t.objeto).not.toMatch(/&nbsp;|\r|\n/)
    expect(t.municipio).toBe('Tocantínia')
    expect(textoDoTceTo('a&amp;b &lt;c&gt;&nbsp; d')).toBe('a&b <c> d')
  })

  it('fundo municipal fica com o nome do fundo e o município oficial; orçamento sigiloso não vira valor', () => {
    const t = licitacao(828771)
    expect(t.orgao).toBe('Fundo Municipal de Saúde de Augustinópolis')
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL')
    expect(t.valorEstimado).toBeUndefined()
    expect(t.rawJson.orcamentoSigiloso).toBe(true)
    expect(orgaoDoTceTo('FUNDO MUNICIPAL DE SAUDE DE RECURSOLANDIA', 'Recursolândia')).toBe('Fundo Municipal de Saude de Recursolândia')
    expect(orgaoDoTceTo('', 'Taguatinga')).toBe('Prefeitura Municipal de Taguatinga')
  })

  it('não leva dado pessoal da origem (assinaturas, CPF, responsável) para a licitação', () => {
    const bruto = JSON.parse(arquivoDoTceTo('lista-abertura-futura.json')) as { raiz: Record<string, unknown>[] }
    const comAssinatura = JSON.stringify({ success: true, total: 1, raiz: [{ ...bruto.raiz[0], assinaturas: [{ nome: 'FULANO DE TAL', cpf: '00000000191' }] }] })
    const l = parseListaTceTo(comAssinatura).linhas[0]
    const leitura = tenderDoTceTo(l)
    expect(leitura.tipo).toBe('licitacao')
    expect(JSON.stringify(leitura)).not.toMatch(/FULANO|00000000191|assinatura"|cpf/i)
  })

  it('unidade estadual fica de fora', () => {
    expect(linhaMunicipal(linha(829251))).toBe(false)
    expect(tenderDoTceTo(linha(829251))).toEqual({ tipo: 'ignorado', motivo: 'unidade estadual' })
  })

  it('situação da 2ª fase: suspensa, homologada e fracassada', () => {
    expect(licitacao(828921).situacao).toBe('SUSPENSA')
    expect(licitacao(824216).situacao).toBe('HOMOLOGADA')
    expect(licitacao(827057).situacao).toBe('ENCERRADA')
    expect(situacaoDoTceTo('Em andamento')).toBe('ABERTA')
    expect(situacaoDoTceTo('')).toBe('ABERTA')
    expect(situacaoDoTceTo('Em análise jurídica')).toBeUndefined()
    expect(tenderDoTceTo({ ...linha(829301), situacaoNaOrigem: 'Em análise jurídica' })).toEqual({ tipo: 'ignorado', motivo: 'situação desconhecida (Em análise jurídica)' })
    expect(tenderDoTceTo({ ...linha(829301), ativo: false })).toMatchObject({ tipo: 'licitacao', tender: { situacao: 'CANCELADA' } })
  })

  it('modalidades: chamada pública e leilão viram OUTROS; dispensa eletrônica e credenciamento pelas marcas da origem', () => {
    expect(licitacao(829273).modalidade).toBe('OUTROS')
    expect(licitacao(828940).modalidade).toBe('OUTROS')
    expect(modalidadeDoTceTo({ modalidade: 'Pregão Eletrônico', dispensaEletronica: true, credenciamento: false })).toBe('DISPENSA_COM_DISPUTA')
    expect(modalidadeDoTceTo({ modalidade: 'Chamada Pública', dispensaEletronica: false, credenciamento: true })).toBe('CREDENCIAMENTO')
    expect(modalidadeDoTceTo({ modalidade: 'Tomada de Preços', dispensaEletronica: false, credenciamento: false })).toBe('TOMADA_DE_PRECOS')
  })

  it('recusa resposta que não é a lista', () => {
    expect(() => parseListaTceTo('<html>erro</html>')).toThrow(/não veio em JSON/)
    expect(() => parseListaTceTo(JSON.stringify({ success: false }))).toThrow(/fora do formato/)
    expect(() => parseListaTceTo(arquivoDoTceTo('detalhe-829301.json'))).toThrow(/fora do formato/)
  })
})

describe('TCE-TO — detalhe (1ª fase)', () => {
  it('lê os veículos de publicação, critério e regime, sem dado pessoal', () => {
    const detalhe = parseDetalheTceTo(arquivoDoTceTo('detalhe-829301.json'))
    expect(detalhe.ativo).toBe(true)
    expect(detalhe.publicacoes.map((p) => p.veiculo)).toEqual(['Diário Oficial da União', 'Jornal de grande circulação *', 'Diário Oficial', 'Website do órgão *'])
    expect(detalhe.criterioDeJulgamento).toBe('Menor Preço')
    const t = licitacao(829301, true)
    expect(t.rawJson).toMatchObject({ detalheLido: true, criterioDeJulgamento: 'Menor Preço', publicadoNoPncp: false })
    expect(JSON.stringify(t)).not.toMatch(/"cpf"|responsavel|email/i)
  })

  it('detalhe com a 2ª fase encerrada muda a situação', () => {
    const json = JSON.parse(arquivoDoTceTo('detalhe-829290.json'))
    json.raiz.situacao2Fase = 'Fracassada'
    const leitura = tenderDoTceTo(linha(829290), parseDetalheTceTo(JSON.stringify(json)))
    expect(leitura).toMatchObject({ tipo: 'licitacao', tender: { situacao: 'ENCERRADA' } })
  })

  it('aponta quando um dos veículos é o PNCP', () => {
    const json = JSON.parse(arquivoDoTceTo('detalhe-829301.json'))
    json.raiz.Publicacoes.resposta.push({ idveiculopublicacao: 'PNCP - Portal Nacional de Contratações Públicas', datapublicacao: '15/10/2026', complemento: '-', ativo: 1 })
    const leitura = tenderDoTceTo(linha(829301), parseDetalheTceTo(JSON.stringify(json)))
    expect(leitura).toMatchObject({ tipo: 'licitacao', tender: { rawJson: { publicadoNoPncp: true } } })
  })

  it('recusa o que não é detalhe', () => {
    expect(() => parseDetalheTceTo(JSON.stringify({ success: true, raiz: {} }))).toThrow(/sem os dados da licitação/)
  })
})

describe('regras do TCE-TO', () => {
  it('os 139 municípios do Tocantins resolvem pelo código do IBGE', () => {
    const codigos = Object.keys(NOMES_DOS_MUNICIPIOS_DO_TOCANTINS)
    expect(codigos).toHaveLength(139)
    expect(codigos.every((c) => municipioDoTocantins(c)?.codigoIbge === c)).toBe(true)
    expect(municipioDoTocantins('2304400')).toBeUndefined()
  })

  it('dia da origem (dd/mm/aaaa ou dd/mm/aa) vira meia-noite de Brasília, sem hora', () => {
    const dia = diaDoTceTo('30/10/2026')!
    expect(dia.toISOString()).toBe('2026-10-30T03:00:00.000Z')
    expect(diaDoTceTo('30/10/26')?.toISOString()).toBe('2026-10-30T03:00:00.000Z')
    expect(diaDoTceTo('31/02/x')).toBeUndefined()
    expect(diaDoTceTo('01/13/2026')).toBeUndefined()
    expect(diaDoTceTo('17/07/2502')).toBeUndefined()
    expect(ehDiaSemHoraDaLicitacao(dia, 'TCE_TO')).toBe(true)
    expect(formatarPrazoDaLicitacao(dia, 'TCE_TO')).toBe('30/10/2026')
  })

  it('a sessão do TCE-TO conta como prazo: aberta até o fim do dia da sessão', () => {
    const t = licitacao(829301)
    const registro = { fonte: t.fonte, situacao: t.situacao!, valorHomologado: null, encerramentoAt: null, aberturaAt: t.aberturaAt!, publicadoAt: t.publicadoAt!, createdAt: AGORA }
    expect(dataDaSessao(registro)).toEqual(t.aberturaAt)
    expect(estaAberta(registro, AGORA)).toBe(true)
    expect(estaAberta(registro, new Date('2026-10-30T20:00:00Z'))).toBe(true)
    expect(estaAberta(registro, new Date('2026-10-31T03:00:01Z'))).toBe(false)
  })

  it('caminhos da API e do portal público', () => {
    const inicio = new Date('2026-10-18T03:00:00Z')
    const caminho = caminhoDaListaTceTo(2, 200, inicio, new Date('2027-11-22T03:00:00Z'))
    expect(caminho.startsWith('/sicap/lco/jurisdicionado/auditor/app/controllers/?c=TCE_sicap_lco_jurisdicionado_auditor_ProcedimentosPublico&m=listarProcedimentos')).toBe(true)
    expect(caminho).toContain('tipodata=abertura')
    expect(caminho).toContain('databrinicio=18%2F10%2F2026')
    expect(caminho).toContain('databrfim=22%2F11%2F2027')
    expect(caminho).toContain('page=2&limit=200&start=200')
    expect(caminhoDoDetalheTceTo(829301)).toContain('m=detalharPrimeiraFase&idProcedimento=829301')
    expect(urlPublicaDoTceTo(1)).toBe('https://app.tceto.tc.br/lo_publico/pesquisar/detalhes?idProcedimento=1')
    expect(fonteIdTceTo(829301)).toBe('TCE-TO-829301')
    expect(idDoProcedimentoTceTo('TCE-TO-829301')).toBe(829301)
    expect(idDoProcedimentoTceTo('TCE-CE-829301')).toBeUndefined()
  })

  it('a assinatura da linha muda quando muda a data da sessão ou a situação', () => {
    const base = linha(829301)
    expect(assinaturaDaLinhaTceTo(base)).toBe(assinaturaDaLinhaTceTo({ ...base }))
    expect(assinaturaDaLinhaTceTo({ ...base, aberturaEm: '06/11/2026' })).not.toBe(assinaturaDaLinhaTceTo(base))
    expect(assinaturaDaLinhaTceTo({ ...base, situacaoNaOrigem: 'Suspenso.' })).not.toBe(assinaturaDaLinhaTceTo(base))
  })
})
