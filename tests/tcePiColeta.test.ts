import { describe, expect, it } from 'vitest'
import {
  DependenciasDaColetaTcePi,
  ESPERA_ENTRE_TENTATIVAS_MS,
  LIMITES_PADRAO_TCE_PI,
  LimitesDaColetaTcePi,
  RegistroDoTcePi,
  abrirSessaoDoTcePi,
  coletarTcePi,
  linhaDoResumoTcePi,
  listarDivulgadasTcePi,
} from '../src/services/tcePiColeta'
import { assinaturaDaLinha, linhasDaTabela, cabecalhoDaTabela } from '../src/services/tcePiParser'
import { NormalizedTender, SituacaoEnum } from '../src/types'
import {
  LinhaFalsaTcePi,
  TABELA,
  detalheFalso,
  erroHttp,
  exportacaoFalsa,
  linhasFalsas,
  paginaDoTcePi,
  pesquisaFalsa,
  publicacoesFalsas,
  redeFalsaTcePi,
  respostaParcial,
} from './helpers/tcePi'

const AGORA = new Date('2026-10-18T15:00:00Z')
const LIMITES: LimitesDaColetaTcePi = { ...LIMITES_PADRAO_TCE_PI }

function pagina(linhas: LinhaFalsaTcePi[], primeira = 0, viewState = `vs-pagina-${primeira}`): string {
  return respostaParcial({ [TABELA]: linhasFalsas(linhas, primeira) }, viewState)
}

function linhas(de: number, quantas: number, extra: Partial<LinhaFalsaTcePi> = {}): LinhaFalsaTcePi[] {
  return Array.from({ length: quantas }, (_, i) => ({ id: de + i, ...extra }))
}

interface Gravacoes {
  lotes: NormalizedTender[][]
  situacoes: { id: string; situacao: SituacaoEnum }[]
  conferencias: { id: string; assinatura: string | null }[]
  consultasAoPncp: string[]
  consultasDeGemea: string[]
  ocultas: { fonteId: string; motivo: string }[]
}

function dependencias(
  rede: ReturnType<typeof redeFalsaTcePi>,
  registros: RegistroDoTcePi[] = [],
  noPncp: (t: NormalizedTender) => boolean = () => false,
  gemeaNoPncp: (t: NormalizedTender) => boolean = () => false
): DependenciasDaColetaTcePi & { gravacoes: Gravacoes } {
  const gravacoes: Gravacoes = { lotes: [], situacoes: [], conferencias: [], consultasAoPncp: [], consultasDeGemea: [], ocultas: [] }
  return {
    gravacoes,
    rede,
    registrosSalvos: async () => registros,
    duplicataNoPncp: async (tender) => {
      gravacoes.consultasAoPncp.push(tender.fonteId)
      return noPncp(tender) ? 'pncp-1' : null
    },
    gemeaPublicadaNoPncp: async (tender) => {
      gravacoes.consultasDeGemea.push(tender.fonteId)
      return gemeaNoPncp(tender) ? 'pncp-2' : null
    },
    salvarLote: async (lote) => {
      gravacoes.lotes.push(lote)
      return { totalNew: lote.length, totalDupes: 0, totalUpdated: 0 }
    },
    guardarOcultas: async (lote, motivo) => {
      for (const t of lote) gravacoes.ocultas.push({ fonteId: t.fonteId, motivo })
    },
    atualizarSituacao: async (registro, situacao) => {
      gravacoes.situacoes.push({ id: registro.id, situacao })
    },
    registrarConferencia: async (id, _agora, assinatura) => {
      gravacoes.conferencias.push({ id, assinatura })
    },
  }
}

describe('TCE-PI — sessão JSF e lista das divulgadas', () => {
  it('abre a página, pesquisa "Divulgada" com o ViewState e o cookie da sessão e pagina de 100 em 100', async () => {
    const rede = redeFalsaTcePi({
      pesquisa: pesquisaFalsa(230),
      paginas: { 0: pagina(linhas(1, 100)), 100: pagina(linhas(101, 100), 100), 200: pagina(linhas(201, 30), 200) },
    })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), LIMITES)

    expect(lista).toMatchObject({ total: 230, paginas: 3, origem: 'tabela', completa: true, bloqueado: false, falhas: [] })
    expect(lista.linhas).toHaveLength(230)
    expect(lista.linhas[0]).toMatchObject({ idNoMural: 1, processoAdministrativo: '1/2026', orgao: 'P. M. DE PAJEU DO PIAUI' })

    const [inicio, pesquisa, ...paginas] = rede.pedidos
    expect(inicio).toMatchObject({ metodo: 'GET', caminho: '/muralic/', cookie: null })
    expect(pesquisa).toMatchObject({ metodo: 'POST', caminho: '/muralic/index.xhtml', cookie: 'JSESSIONID=sessao-falsa.no1' })
    expect(pesquisa.campos.get('tvPrincipal:status_input')).toBe('2')
    expect(pesquisa.campos.get('tvPrincipal:tvMaisFiltros:status2_input')).toBe('2')
    expect(pesquisa.campos.get('javax.faces.ViewState')).toBe('-3328642883472013474:-2228580570148750960')
    expect(pesquisa.campos.get('javax.faces.partial.ajax')).toBe('true')
    expect([...pesquisa.campos.keys()].some((k) => k.endsWith('_focus'))).toBe(false)
    expect(paginas.map((p) => [p.campos.get(`${TABELA}_first`), p.campos.get(`${TABELA}_rows`), p.campos.get('javax.faces.ViewState'), p.cookie])).toEqual([
      ['0', '100', 'vs-pesquisa', 'JSESSIONID=sessao-falsa.no1'],
      ['100', '100', 'vs-pagina-0', 'JSESSIONID=sessao-falsa.no1'],
      ['200', '100', 'vs-pagina-100', 'JSESSIONID=sessao-falsa.no1'],
    ])
  })

  it('página que falha cai para a planilha exportada, que traz a lista inteira de uma vez', async () => {
    const todas = linhas(1, 150)
    const rede = redeFalsaTcePi({
      pesquisa: pesquisaFalsa(150),
      paginas: { 0: pagina(todas.slice(0, 100)), 100: respostaParcial({}) },
      exportacao: exportacaoFalsa(todas),
    })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), LIMITES)

    expect(lista).toMatchObject({ origem: 'planilha', completa: true, paginas: 1 })
    expect(lista.linhas).toHaveLength(150)
    expect(lista.linhas.find((l) => l.idNoMural === 5)?.processoAdministrativo).toBe('5/2026')
    expect(lista.linhas.find((l) => l.idNoMural === 120)?.processoAdministrativo).toBeUndefined()
    expect(lista.falhas).toEqual([expect.stringContaining('página 2')])
    const exportar = rede.pedidos.at(-1)!
    expect(exportar.campos.get('javax.faces.source')).toBe('formListaLic:listaLic:j_idt271')
    expect(exportar.campos.get('javax.faces.partial.execute')).toBe('@all')
    expect(exportar.campos.get('javax.faces.ViewState')).toBe('vs-novo')
  })

  it('lê a planilha real exportada pelo mural quando a paginação não serve', async () => {
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(313), paginas: { 0: erroHttp(400) }, exportacao: paginaDoTcePi('exportacao-divulgadas.xml') })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), LIMITES)
    expect(lista).toMatchObject({ origem: 'planilha', completa: true, total: 313 })
    expect(lista.linhas).toHaveLength(313)
  })

  it('o teto de páginas deixa a lista incompleta e recorre à planilha', async () => {
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(500), paginas: { 0: pagina(linhas(1, 100)) }, exportacao: erroHttp(500) })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), { ...LIMITES, maxPaginas: 1 })
    expect(lista).toMatchObject({ origem: 'tabela', completa: false, paginas: 1 })
    expect(lista.linhas).toHaveLength(100)
    expect(lista.falhas).toEqual(['limite de 1 páginas', expect.stringContaining('planilha')])
  })

  it('espera e tenta de novo em erro 5xx ou de rede, com espera crescente', async () => {
    const rede = redeFalsaTcePi({ pesquisa: [erroHttp(503), erroHttp(undefined), pesquisaFalsa(1)], paginas: { 0: pagina(linhas(1, 1)) } })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), LIMITES)
    expect(lista.completa).toBe(true)
    expect(rede.esperas).toEqual([ESPERA_ENTRE_TENTATIVAS_MS, ESPERA_ENTRE_TENTATIVAS_MS * 2])
  })

  it('para na hora com 403 ou 429, sem tentar de novo nem seguir para outras páginas', async () => {
    for (const status of [403, 429]) {
      const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(300), paginas: { 0: pagina(linhas(1, 100)), 100: erroHttp(status) } })
      const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), LIMITES)
      expect(lista).toMatchObject({ bloqueado: true, completa: false })
      expect(rede.pedidos).toHaveLength(4)
      expect(rede.esperas).toEqual([])
    }
  })

  it('resposta de sessão expirada ou erro do JSF não é aceita como lista', async () => {
    const expirada = `<?xml version='1.0' encoding='UTF-8'?><partial-response><error><error-name>javax.faces.application.ViewExpiredException</error-name></error></partial-response>`
    const rede = redeFalsaTcePi({ pesquisa: expirada })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 50), LIMITES)
    expect(lista).toMatchObject({ origem: 'nenhuma', completa: false, bloqueado: false })
    expect(lista.falhas[0]).toContain('ViewExpiredException')
  })

  it('respeita o teto de requisições da coleta', async () => {
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(1000), paginas: Object.fromEntries(Array.from({ length: 10 }, (_, i) => [i * 100, pagina(linhas(i * 100 + 1, 100), i * 100)])) })
    const lista = await listarDivulgadasTcePi(abrirSessaoDoTcePi(rede, 4), LIMITES)
    expect(rede.pedidos).toHaveLength(4)
    expect(lista).toMatchObject({ completa: false, paginas: 2 })
    expect(lista.falhas.at(-1)).toContain('limite de 4 requisições')
  })
})

describe('TCE-PI — coleta', () => {
  const RECENTE = { cadastro: '17/10/2026', publicacao: '17/10/2026' }

  it('descarta o que o PNCP já tem, usa a publicação no PNCP informada ao TCE como sinal firme e grava o resto', async () => {
    const NO_PNCP = publicacoesFalsas(['Diário Oficial do Estado', 'PNCP (Portal Nacional de Contratações Públicas)'])
    const lista: LinhaFalsaTcePi[] = [
      { id: 10, objeto: 'Pavimentação já no PNCP' },
      { id: 11, ...RECENTE, objeto: 'Quadra publicada também no PNCP, ainda sem par no banco' },
      { id: 12, ...RECENTE, objeto: 'Merenda só no diário dos municípios' },
      { id: 13, objeto: 'Antiga, cadastrada há semanas' },
      { id: 14, abertura: '10/10/2026 09:00', objeto: 'Sessão já passou' },
      { id: 15, orgao: 'SECRETARIA DA SAÚDE', esfera: 'ESTADUAL', objeto: 'Medicamentos do estado' },
      { id: 16, objeto: 'Ponte com gêmea no PNCP' },
      { id: 17, objeto: 'Informada no PNCP há semanas e sem par no banco' },
    ]
    const rede = redeFalsaTcePi({
      pesquisa: pesquisaFalsa(lista.length),
      paginas: { 0: pagina(lista) },
      publicacoes: { 11: NO_PNCP, 12: publicacoesFalsas(['Diário Oficial dos Municípios']), 16: NO_PNCP, 17: NO_PNCP },
    })
    const dep = dependencias(
      rede,
      [],
      (t) => t.objeto.includes('já no PNCP'),
      (t) => t.objeto.includes('gêmea')
    )
    const resumo = await coletarTcePi(dep, AGORA, LIMITES)

    expect(resumo).toMatchObject({
      origemDaLista: 'tabela',
      listaCompleta: true,
      registrosNaLista: 8,
      comSessaoFutura: 7,
      municipios: 2,
      jaNoPncp: 1,
      jaNoPncpPeloMural: 1,
      aguardandoPncp: 1,
      publicadasNoPncpSemGemea: 1,
      consultasDePublicacao: 6,
      novasForaDoPncp: 4,
      totalNew: 4,
      adiadasPeloLimite: 0,
      bloqueado: false,
      falhas: [],
    })
    const salvos = dep.gravacoes.lotes.flat()
    expect(salvos.map((t) => t.fonteId).sort()).toEqual(['TCE-PI-12', 'TCE-PI-13', 'TCE-PI-15', 'TCE-PI-17'])
    expect(salvos.find((t) => t.fonteId === 'TCE-PI-12')?.rawJson).toMatchObject({ publicadoNoPncp: false, publicacoes: [{ meio: 'Diário Oficial dos Municípios' }] })
    expect(salvos.find((t) => t.fonteId === 'TCE-PI-17')?.rawJson).toMatchObject({ publicadoNoPncp: true })
    expect(salvos.find((t) => t.fonteId === 'TCE-PI-15')).toMatchObject({ municipio: 'Teresina', orgao: 'SECRETARIA DA SAÚDE', unidade: 'SECRETARIA DA SAÚDE' })
    expect(dep.gravacoes.consultasAoPncp).not.toContain('TCE-PI-14')
    expect(dep.gravacoes.consultasDeGemea).toEqual(['TCE-PI-11', 'TCE-PI-16', 'TCE-PI-17'])
    expect(dep.gravacoes.ocultas).toEqual([{ fonteId: 'TCE-PI-16', motivo: 'PUBLICADA_NO_PNCP' }])
    const detalhes = rede.pedidos.filter((p) => p.metodo === 'GET' && p.caminho.includes('detalhelicitacao'))
    expect(detalhes.map((p) => Number(p.caminho.split('=')[1]))).toEqual([11, 12, 13, 15, 16, 17])
    const painel = rede.pedidos.filter((p) => p.campos.get('javax.faces.source') === 'j_idt162')
    expect(painel).toHaveLength(6)
    expect([painel[0].caminho, painel[0].campos.get('j_idt162_newTab'), painel[0].campos.get('j_idt162_tabindex'), painel[0].campos.get('j_idt162_contentLoad')]).toEqual([
      '/muralic/detalhelicitacao.xhtml',
      'j_idt162:j_idt247',
      '1',
      'true',
    ])
    expect(painel[0].campos.get('javax.faces.ViewState')).toBe('-1988834351872513829:8918693224709406267')
    expect(linhaDoResumoTcePi(resumo)).toContain('novas fora do PNCP: 4')
  })

  it('detalhe fora do formato não impede a gravação: a licitação entra sem o sinal das publicações', async () => {
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(1), paginas: { 0: pagina([{ id: 70 }]) }, detalhes: { 70: '<html><body><p>manutenção</p></body></html>' } })
    const dep = dependencias(rede)
    const resumo = await coletarTcePi(dep, AGORA, LIMITES)
    expect(resumo).toMatchObject({ novasForaDoPncp: 1, consultasDePublicacao: 0, adiadasPeloLimite: 0 })
    expect(resumo.falhas).toEqual([expect.stringContaining('publicações 70')])
    expect(dep.gravacoes.lotes.flat()[0].rawJson).toMatchObject({ publicadoNoPncp: null, publicacoes: [] })
  })

  it('revisita só o que mudou, reabre a suspensa que voltou a ser divulgada e confere a que sumiu da lista', async () => {
    const lista: LinhaFalsaTcePi[] = [
      { id: 20, objeto: 'Sem mudança' },
      { id: 21, objeto: 'Data remarcada', abertura: '20/11/2026 09:00' },
      { id: 22, objeto: 'Voltou da suspensão' },
    ]
    const cabecalho = cabecalhoDaTabela(pesquisaFalsa(0).match(/<!\[CDATA\[([\s\S]*?)\]\]>/)![1])
    const [semMudanca, , voltou] = linhasDaTabela(linhasFalsas(lista), cabecalho)
    const registro = (id: number, situacao: SituacaoEnum, assinatura: string | null, publicadoNoPncp: boolean | null = null): RegistroDoTcePi => ({
      id: `r${id}`,
      idNoMural: id,
      situacao,
      aberturaAt: new Date('2026-11-05T12:00:00Z'),
      conferidaEm: new Date('2026-10-17T12:00:00Z'),
      assinaturaDaLista: assinatura,
      publicadoNoPncp,
      oculta: false,
    })
    const registros = [
      registro(20, 'ABERTA', assinaturaDaLinha(semMudanca)),
      registro(21, 'ABERTA', 'antiga', false),
      registro(22, 'SUSPENSA', assinaturaDaLinha(voltou)),
      registro(23, 'ABERTA', 'qualquer'),
      { ...registro(25, 'ABERTA', 'qualquer'), oculta: true },
      { ...registro(24, 'ABERTA', 'qualquer'), aberturaAt: new Date('2026-10-01T12:00:00Z') },
    ]
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(3), paginas: { 0: pagina(lista) }, detalhes: { 23: detalheFalso('CANCELADA') } })
    const dep = dependencias(rede, registros)
    const resumo = await coletarTcePi(dep, AGORA, LIMITES)

    expect(resumo).toMatchObject({ revisitadas: 1, sumidas: 1, situacoesAlteradas: 2, totalNew: 1, consultasDePublicacao: 0 })
    expect(dep.gravacoes.lotes.flat().map((t) => [t.fonteId, t.aberturaAt?.toISOString(), t.rawJson.publicadoNoPncp])).toEqual([['TCE-PI-21', '2026-11-20T12:00:00.000Z', false]])
    expect(dep.gravacoes.situacoes).toEqual([
      { id: 'r22', situacao: 'ABERTA' },
      { id: 'r23', situacao: 'CANCELADA' },
    ])
    expect(dep.gravacoes.conferencias.map((c) => c.id)).toEqual(['r20', 'r21', 'r22', 'r23'])
    expect(dep.gravacoes.consultasAoPncp).toEqual([])
    expect(rede.pedidos.filter((p) => p.caminho.includes('detalhelicitacao')).map((p) => p.caminho)).toEqual(['/muralic/detalhelicitacao.xhtml?id=23'])
  })

  it('lista incompleta não confere sumidas; o teto de consultas adia as novas recentes para a próxima coleta', async () => {
    const lista = linhas(30, 5, { cadastro: '18/10/2026' })
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(8), paginas: { 0: pagina(lista) }, exportacao: erroHttp(500) })
    const registros: RegistroDoTcePi[] = [
      { id: 'r99', idNoMural: 99, situacao: 'ABERTA', aberturaAt: new Date('2026-11-05T12:00:00Z'), conferidaEm: null, assinaturaDaLista: null, publicadoNoPncp: null, oculta: false },
    ]
    const dep = dependencias(rede, registros)
    const resumo = await coletarTcePi(dep, AGORA, { ...LIMITES, maxConsultasDePublicacao: 2 })

    expect(resumo).toMatchObject({ listaCompleta: false, consultasDePublicacao: 2, novasForaDoPncp: 2, adiadasPeloLimite: 3, sumidas: 0 })
    expect(rede.pedidos.some((p) => p.caminho.includes('id=99'))).toBe(false)
  })

  it('bloqueio do portal nas consultas encerra as consultas da coleta e grava o que já estava decidido', async () => {
    const lista = [...linhas(40, 3), { id: 50, objeto: 'Revisada' }]
    const registros: RegistroDoTcePi[] = [
      { id: 'r50', idNoMural: 50, situacao: 'ABERTA', aberturaAt: new Date('2026-11-05T12:00:00Z'), conferidaEm: null, assinaturaDaLista: 'antiga', publicadoNoPncp: false, oculta: false },
    ]
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(4), paginas: { 0: pagina(lista) }, detalhes: { 40: erroHttp(429) } })
    const dep = dependencias(rede, registros)
    const resumo = await coletarTcePi(dep, AGORA, LIMITES)

    expect(resumo).toMatchObject({ bloqueado: true, novasForaDoPncp: 0, revisitadas: 1, adiadasPeloLimite: 3, consultasDePublicacao: 0 })
    expect(dep.gravacoes.lotes.flat().map((t) => t.fonteId)).toEqual(['TCE-PI-50'])
    expect(rede.pedidos.filter((p) => p.caminho.includes('detalhelicitacao'))).toHaveLength(1)
    expect(rede.esperas).toEqual([])
  })

  it('falha ao consultar o PNCP no banco não grava a licitação (fica para a próxima)', async () => {
    const rede = redeFalsaTcePi({ pesquisa: pesquisaFalsa(1), paginas: { 0: pagina([{ id: 60 }]) } })
    const dep = dependencias(rede)
    dep.duplicataNoPncp = async () => {
      throw new Error('banco fora')
    }
    const resumo = await coletarTcePi(dep, AGORA, LIMITES)
    expect(resumo.novasForaDoPncp).toBe(0)
    expect(resumo.falhas).toEqual(['PNCP 60 (banco fora)'])
    expect(dep.gravacoes.lotes.flat()).toEqual([])
  })
})
