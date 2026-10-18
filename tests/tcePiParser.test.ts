import { describe, expect, it } from 'vitest'
import {
  NOMES_DOS_MUNICIPIOS_DO_PIAUI,
} from '../src/services/tcePiMunicipios'
import {
  FormatoInesperadoDoTcePi,
  LinhaDoMuralTcePi,
  assinaturaDaLinha,
  cadastradaHaPouco,
  camposDaExportacao,
  camposDaPagina,
  camposDaPesquisa,
  camposDoPainel,
  fonteIdTcePi,
  formularioDoMural,
  idNoMuralTcePi,
  lerRespostaParcial,
  linhaComSessaoFutura,
  linhasDaPlanilha,
  linhasDaTabela,
  localDoOrgao,
  modalidadeDoTcePi,
  municipioDoPiaui,
  numeroDoProcedimento,
  orgaoLegivel,
  parseDetalheTcePi,
  planilhaDaExportacao,
  publicacoesDoPainel,
  publicadoNoPncp,
  situacaoDoTcePi,
  tabelaDoMural,
  tenderDoTcePi,
} from '../src/services/tcePiParser'
import { TABELA, paginaDoTcePi } from './helpers/tcePi'

const INICIO = paginaDoTcePi('inicio.html')
const PESQUISA = lerRespostaParcial(paginaDoTcePi('pesquisa-divulgadas.xml'))
const TABELA_DA_PESQUISA = tabelaDoMural(PESQUISA.atualizacoes.get(TABELA)!)
const PLANILHA = linhasDaPlanilha(planilhaDaExportacao(lerRespostaParcial(paginaDoTcePi('exportacao-divulgadas.xml'))))
const AGORA = new Date('2026-10-18T15:00:00Z')

describe('TCE-PI — formulário JSF do mural', () => {
  it('acha o filtro "Divulgada (abertura futura)", o botão, a tabela, o exportar e o ViewState da página real', () => {
    const f = formularioDoMural(INICIO)
    expect(f).toMatchObject({
      acao: '/muralic/index.xhtml',
      formularioDoFiltro: 'j_idt20',
      camposDoStatus: ['tvPrincipal:status_input', 'tvPrincipal:tvMaisFiltros:status2_input'],
      valorDaDivulgada: '2',
      botaoPesquisar: 'btnPesquisar',
      tabela: 'formListaLic:listaLic',
      exportar: 'formListaLic:listaLic:j_idt271',
      viewState: '-3328642883472013474:-2228580570148750960',
    })
    expect(f.camposDoFiltro.some(([n]) => n.endsWith('_focus'))).toBe(false)
    expect(new Map(f.camposDoFiltro).get('tvPrincipal:tvMaisFiltros:srp_input')).toBe('')
  })

  it('monta os envios da pesquisa, da página e da exportação com o ViewState informado', () => {
    const f = formularioDoMural(INICIO)
    const pesquisa = new Map(camposDaPesquisa(f, 'vs-1'))
    expect(pesquisa.get('tvPrincipal:status_input')).toBe('2')
    expect(pesquisa.get('tvPrincipal:tvMaisFiltros:status2_input')).toBe('2')
    expect(pesquisa.get('tvPrincipal:mod_input')).toBe('')
    expect(pesquisa.get('javax.faces.ViewState')).toBe('vs-1')
    expect(pesquisa.get('javax.faces.source')).toBe('btnPesquisar')
    expect(pesquisa.get('javax.faces.partial.execute')).toBe('j_idt20')
    expect(pesquisa.get('btnPesquisar')).toBe('btnPesquisar')

    const pagina = new Map(camposDaPagina(f, 'vs-2', 200, 100))
    expect([pagina.get(`${TABELA}_pagination`), pagina.get(`${TABELA}_first`), pagina.get(`${TABELA}_rows`), pagina.get('javax.faces.ViewState')]).toEqual(['true', '200', '100', 'vs-2'])
    expect(pagina.get('formListaLic')).toBe('formListaLic')

    const exportar = new Map(camposDaExportacao(f, 'vs-3'))
    expect(exportar.get('formListaLic:listaLic:j_idt271')).toBe('formListaLic:listaLic:j_idt271')
    expect(exportar.has('javax.faces.partial.render')).toBe(false)
  })

  it('página sem o filtro de status é recusada como formato inesperado', () => {
    expect(() => formularioDoMural('<html><body><form id="x"></form></body></html>')).toThrow(FormatoInesperadoDoTcePi)
  })
})

describe('TCE-PI — respostas parciais', () => {
  it('lê as atualizações e o novo ViewState da pesquisa real', () => {
    expect([...PESQUISA.atualizacoes.keys()]).toEqual(['growl', 'j_idt20', TABELA, 'j_id1:javax.faces.ViewState:0'])
    expect(PESQUISA.viewState).toBe('-3328642883472013474:-2228580570148750960')
    expect(PESQUISA.erro).toBeUndefined()
  })

  it('reconhece erro do JSF e redirecionamento, e recusa o que não é resposta parcial', () => {
    expect(lerRespostaParcial(`<partial-response><error><error-name>javax.faces.application.ViewExpiredException</error-name></error></partial-response>`).erro).toBe(
      'javax.faces.application.ViewExpiredException'
    )
    expect(lerRespostaParcial(`<partial-response><redirect url="/muralic/"/></partial-response>`).redirecionamento).toBe('/muralic/')
    expect(() => lerRespostaParcial('<html>manutenção</html>')).toThrow(FormatoInesperadoDoTcePi)
  })

  it('junta CDATA quebrado em vários pedaços', () => {
    const r = lerRespostaParcial(`<partial-response><changes><update id="a"><![CDATA[x]]]]><![CDATA[>y]]></update></changes></partial-response>`)
    expect(r.atualizacoes.get('a')).toBe('x]]>y')
  })
})

describe('TCE-PI — tabela e planilha', () => {
  it('a tabela da pesquisa tem o total de divulgadas e a primeira página', () => {
    expect(TABELA_DA_PESQUISA.total).toBe(313)
    expect(TABELA_DA_PESQUISA.linhas).toHaveLength(8)
    expect(TABELA_DA_PESQUISA.linhas[0]).toEqual<LinhaDoMuralTcePi>({
      idNoMural: 1175365,
      orgao: 'P. M. DE PAJEU DO PIAUI',
      esfera: 'MUNICIPAL',
      controleTce: 'LW-010651/26',
      procedimento: 'Concorrência nº 11/2026',
      processoAdministrativo: '0.010.00003435/2026',
      regimeJuridico: 'Lei nº 14.133/21',
      modalidade: 'Concorrência',
      formaDeRealizacao: 'Eletrônica',
      criterioDeJulgamento: 'Menor preço',
      tipoDeObjeto: 'Obras e Serviços de Engenharia',
      objeto: 'CONTRATAÇÃO DE EMPRESA PARA CONSTRUÇÃO DE UMA QUADRA ESPORTIVA NA LOCALIDADE CAJÁS, ZONA RURAL DO MUNICÍPIO DE PAJEÚ DO PIAUÍ – PI.',
      aberturaEm: '03/11/2026 08:00',
      valor: 390600,
      status: 'Divulgada',
      ultimaPublicacaoEm: '17/10/2026',
      cadastroEm: '17/10/2026',
      atualizadoEm: '17/10/2026',
    })
  })

  it('a página real (linhas soltas, sem cabeçalho) é lida com o cabeçalho da pesquisa', () => {
    const pagina = lerRespostaParcial(paginaDoTcePi('pagina-300.xml'))
    const linhas = linhasDaTabela(pagina.atualizacoes.get(TABELA)!, TABELA_DA_PESQUISA.cabecalho)
    expect(linhas).toHaveLength(13)
    expect(linhas[0]).toMatchObject({ idNoMural: 1135942, orgao: 'P. M. DE JOAQUIM PIRES', processoAdministrativo: '009/2026', aberturaEm: '06/02/2026 08:00', valor: 569507 })
  })

  it('a planilha real exportada traz as 313 divulgadas com os mesmos campos (menos o processo administrativo)', () => {
    expect(PLANILHA).toHaveLength(313)
    const { processoAdministrativo, ...semProcesso } = TABELA_DA_PESQUISA.linhas[0]
    expect(processoAdministrativo).toBeDefined()
    expect(PLANILHA[0]).toEqual({ ...semProcesso, processoAdministrativo: undefined })
    expect(new Set(PLANILHA.map((l) => l.status))).toEqual(new Set(['Divulgada']))
    expect(PLANILHA.every((l) => l.idNoMural > 0 && l.objeto && l.aberturaEm)).toBe(true)
    expect(new Set(PLANILHA.map((l) => l.idNoMural)).size).toBe(313)
  })

  it('todo órgão da planilha real cai num município do Piauí (estaduais pela sede, em Teresina)', () => {
    const locais = PLANILHA.map((l) => ({ l, local: localDoOrgao(l.orgao, l.esfera) }))
    expect(locais.filter((x) => !x.local)).toEqual([])
    expect(locais.filter((x) => x.l.esfera === 'ESTADUAL').every((x) => x.local?.nome === 'Teresina' && x.local.pelaSede)).toBe(true)
    expect(new Set(locais.filter((x) => x.l.esfera === 'MUNICIPAL').map((x) => x.local?.codigoIbge)).size).toBe(124)
  })

  it('planilha corrompida ou sem planilha é formato inesperado', () => {
    expect(() => linhasDaPlanilha(new Uint8Array([1, 2, 3]))).toThrow(FormatoInesperadoDoTcePi)
    expect(() => planilhaDaExportacao(lerRespostaParcial('<partial-response><changes></changes></partial-response>'))).toThrow(FormatoInesperadoDoTcePi)
  })
})

describe('TCE-PI — detalhe e publicações', () => {
  it('lê o status e o painel dinâmico de publicações do detalhe real', () => {
    const divulgada = parseDetalheTcePi(paginaDoTcePi('detalhe-divulgada-1175365.html'))
    expect(divulgada).toMatchObject({
      status: 'DIVULGADA',
      aberturaEm: '03/11/2026 08:00',
      acao: '/muralic/detalhelicitacao.xhtml',
      painelDePublicacoes: { acordeao: 'j_idt162', painel: 'j_idt162:j_idt247', indice: 1 },
    })
    expect(parseDetalheTcePi(paginaDoTcePi('detalhe-suspensa-1175015.html')).status).toBe('SUSPENSA')

    const campos = new Map(camposDoPainel(divulgada, divulgada.painelDePublicacoes!))
    expect([campos.get('j_idt588'), campos.get('j_idt162_contentLoad'), campos.get('j_idt162_newTab'), campos.get('j_idt162_tabindex')]).toEqual(['j_idt588', 'true', 'j_idt162:j_idt247', '1'])
  })

  it('as publicações reais da licitação incluem o PNCP', () => {
    const painel = { acordeao: 'j_idt162', painel: 'j_idt162:j_idt247', indice: 1 }
    const publicacoes = publicacoesDoPainel(lerRespostaParcial(paginaDoTcePi('publicacoes-1175365.xml')), painel)
    expect(publicacoes.map((p) => p.meio)).toEqual(['Diário Oficial da União', 'Diário Oficial do Estado', 'Diário Oficial dos Municípios', 'PNCP (Portal Nacional de Contratações Públicas)'])
    expect(publicacoes[0]).toEqual({ data: '16/10/2026', tipo: 'Aviso de abertura de licitação', meio: 'Diário Oficial da União' })
    expect(publicadoNoPncp(publicacoes)).toBe(true)
    expect(publicadoNoPncp(publicacoes.slice(0, 3))).toBe(false)
  })

  it('detalhe fora do formato é recusado', () => {
    expect(() => parseDetalheTcePi('<html><body>manutenção</body></html>')).toThrow(FormatoInesperadoDoTcePi)
  })
})

describe('TCE-PI — normalização', () => {
  it('situação do mural', () => {
    expect(['Divulgada', 'DIVULGADA', 'Aberta', 'SUSPENSA', 'CANCELADA', 'FINALIZADA', 'EM HOMOLOGAÇÃO', 'Revogada', 'Anulada'].map(situacaoDoTcePi)).toEqual([
      'ABERTA', 'ABERTA', 'ABERTA', 'SUSPENSA', 'CANCELADA', 'ENCERRADA', 'ENCERRADA', 'REVOGADA', 'ANULADA',
    ])
    expect(situacaoDoTcePi('NÃO FINALIZADA')).toBeUndefined()
  })

  it('modalidade pela forma de realização', () => {
    expect(modalidadeDoTcePi('Pregão', 'Eletrônica')).toBe('PREGAO_ELETRONICO')
    expect(modalidadeDoTcePi('Pregão', 'Presencial')).toBe('PREGAO_PRESENCIAL')
    expect(modalidadeDoTcePi('Aviso de Dispensa', 'Eletrônica')).toBe('DISPENSA_COM_DISPUTA')
    expect(modalidadeDoTcePi('Aviso de Dispensa', 'Presencial')).toBe('DISPENSA_SEM_DISPUTA')
    expect(modalidadeDoTcePi('Concorrência', 'Eletrônica')).toBe('CONCORRENCIA')
    expect(modalidadeDoTcePi('Tomada de preço', 'Presencial')).toBe('TOMADA_DE_PRECOS')
    expect(modalidadeDoTcePi('Credenciamento', 'Presencial')).toBe('CREDENCIAMENTO')
    expect(modalidadeDoTcePi('Diálogo competitivo', undefined)).toBe('DIALOGO_COMPETITIVO')
    expect(modalidadeDoTcePi('Chamada pública', 'Eletrônica')).toBe('OUTROS')
    expect(modalidadeDoTcePi('Leilão', 'Eletrônica')).toBe('OUTROS')
  })

  it('município do Piauí com nome oficial, inclusive grafias do TCE sem apóstrofo ou sem "do Piauí"', () => {
    expect(Object.keys(NOMES_DOS_MUNICIPIOS_DO_PIAUI)).toHaveLength(224)
    expect(municipioDoPiaui('PAU DARCO DO PIAUI')).toMatchObject({ nome: "Pau D'Arco do Piauí", codigoIbge: '2207793' })
    expect(municipioDoPiaui('OLHO D AGUA DO PIAUI')?.nome).toBe("Olho D'Água do Piauí")
    expect(municipioDoPiaui('TAMBORIL')?.nome).toBe('Tamboril do Piauí')
    expect(municipioDoPiaui('PAQUETA DO PIAUI')?.nome).toBe('Paquetá')
    expect(municipioDoPiaui('FORTALEZA')).toBeUndefined()
  })

  it('órgão municipal pelo nome mais longo no fim; estadual pela sede', () => {
    expect(localDoOrgao('P. M. DE SAO JOAO DO ARRAIAL', 'MUNICIPAL')?.nome).toBe('São João do Arraial')
    expect(localDoOrgao('FUNDAÇÃO MUNICIPAL DE SAUDE DE TERESINA', 'MUNICIPAL')?.nome).toBe('Teresina')
    expect(localDoOrgao('SECRETARIA DE ADMINISTRACAO E PLANEJAMENTO DE FLORIANO', 'MUNICIPAL')?.nome).toBe('Floriano')
    expect(localDoOrgao('DER-PI - DEPARTAMENTO DE ESTRADAS DE RODAGEM DO PI', 'ESTADUAL')).toMatchObject({ nome: 'Teresina', pelaSede: true })
    expect(localDoOrgao('CONSORCIO REGIONAL', 'MUNICIPAL')).toBeUndefined()
  })

  it('nome do órgão legível para a prefeitura e a câmara', () => {
    expect(orgaoLegivel('P. M. DE PAJEU DO PIAUI', localDoOrgao('P. M. DE PAJEU DO PIAUI', 'MUNICIPAL'))).toBe('Prefeitura Municipal de Pajeú do Piauí')
    expect(orgaoLegivel('CAMARA DE PEDRO II', localDoOrgao('CAMARA DE PEDRO II', 'MUNICIPAL'))).toBe('Câmara Municipal de Pedro II')
    expect(orgaoLegivel('SECRETARIA DA SAÚDE', localDoOrgao('SECRETARIA DA SAÚDE', 'ESTADUAL'))).toBe('SECRETARIA DA SAÚDE')
  })

  it('número do procedimento e fonteId estável', () => {
    expect(numeroDoProcedimento('Concorrência nº 11/2026')).toBe('11/2026')
    expect(numeroDoProcedimento('Pregão nº PE 155/2026')).toBe('PE 155/2026')
    expect(numeroDoProcedimento('Credenciamento Nº CR 002/2026')).toBe('CR 002/2026')
    expect(numeroDoProcedimento('sem número')).toBeUndefined()
    expect(fonteIdTcePi(1175365)).toBe('TCE-PI-1175365')
    expect(idNoMuralTcePi('TCE-PI-1175365')).toBe(1175365)
    expect(idNoMuralTcePi('TCE-CE-1')).toBeUndefined()
  })
})

describe('TCE-PI — licitação normalizada', () => {
  const linha = TABELA_DA_PESQUISA.linhas[0]

  it('vira licitação aberta do PNCP-like com sessão em Brasília, IBGE e link do detalhe', () => {
    const leitura = tenderDoTcePi(linha)
    expect(leitura.tipo).toBe('licitacao')
    if (leitura.tipo !== 'licitacao') return
    expect(leitura.tender).toMatchObject({
      fonte: 'TCE_PI',
      fonteId: 'TCE-PI-1175365',
      modalidade: 'CONCORRENCIA',
      situacao: 'ABERTA',
      valorEstimado: 390600,
      uf: 'PI',
      municipio: 'Pajeú do Piauí',
      municipioIbge: '2207355',
      orgao: 'Prefeitura Municipal de Pajeú do Piauí',
      linkEdital: 'https://sistemas.tce.pi.gov.br/muralic/detalhelicitacao.xhtml?id=1175365',
      numeroControle: '11/2026',
    })
    expect(leitura.tender.aberturaAt?.toISOString()).toBe('2026-11-03T11:00:00.000Z')
    expect(leitura.tender.publicadoAt?.toISOString()).toBe('2026-10-17T03:00:00.000Z')
    expect(leitura.tender.encerramentoAt).toBeUndefined()
    expect(leitura.tender.rawJson).toMatchObject({ controleTce: 'LW-010651/26', processoAdministrativo: '0.010.00003435/2026', esfera: 'MUNICIPAL', assinaturaDaLista: assinaturaDaLinha(linha) })
  })

  it('a planilha inteira vira licitação sem ignorar nenhuma', () => {
    expect(PLANILHA.map(tenderDoTcePi).filter((l) => l.tipo === 'ignorado')).toEqual([])
  })

  it('ignora situação desconhecida, objeto vazio e data ausente', () => {
    expect(tenderDoTcePi({ ...linha, status: 'Rascunho' })).toMatchObject({ tipo: 'ignorado' })
    expect(tenderDoTcePi({ ...linha, objeto: '' })).toMatchObject({ tipo: 'ignorado', motivo: 'sem objeto' })
    expect(tenderDoTcePi({ ...linha, aberturaEm: undefined })).toMatchObject({ tipo: 'ignorado', motivo: 'sem data de abertura' })
  })

  it('sessão futura conta o dia de hoje em Brasília; cadastro recente pelos dias de espera', () => {
    expect(linhaComSessaoFutura({ ...linha, aberturaEm: '18/10/2026 00:00' }, AGORA)).toBe(true)
    expect(linhaComSessaoFutura({ ...linha, aberturaEm: '17/10/2026 23:59' }, AGORA)).toBe(false)
    expect(PLANILHA.filter((l) => linhaComSessaoFutura(l, AGORA))).toHaveLength(264)
    expect(cadastradaHaPouco({ ...linha, cadastroEm: '15/10/2026' }, AGORA, 3)).toBe(true)
    expect(cadastradaHaPouco({ ...linha, cadastroEm: '14/10/2026' }, AGORA, 3)).toBe(false)
  })

  it('assinatura muda com a data ou a situação, não com o processo administrativo', () => {
    expect(assinaturaDaLinha({ ...linha, aberturaEm: '04/11/2026 08:00' })).not.toBe(assinaturaDaLinha(linha))
    expect(assinaturaDaLinha({ ...linha, status: 'Suspensa' })).not.toBe(assinaturaDaLinha(linha))
    expect(assinaturaDaLinha({ ...linha, processoAdministrativo: undefined })).toBe(assinaturaDaLinha(linha))
  })
})
