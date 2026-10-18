import { describe, expect, it } from 'vitest'
import {
  LinhaDaListaTceCe,
  assinaturaDaLinha,
  diaDeBrasilia,
  disputaEletronica,
  fonteIdTceCe,
  idDaLicitacaoTceCe,
  linhaComSessaoFutura,
  modalidadeDoTceCe,
  municipioDoCeara,
  parseDetalheTceCe,
  parseListaTceCe,
  plataformaDoLocal,
  situacaoDoTceCe,
  tenderDoTceCe,
  urlDoDetalheTceCe,
} from '../src/services/tceCeParser'
import { dataDaSessao } from '../src/lib/dataDaSessao'
import { estaAberta } from '../src/lib/licitacaoAberta'
import { ehDiaSemHoraDaLicitacao } from '../src/lib/dataDeBrasilia'
import { NormalizedTender } from '../src/types'
import { paginaDoTceCe } from './helpers/tceCe'

const AGORA = new Date('2026-10-17T15:00:00Z')
const PAGINA_1 = parseListaTceCe(paginaDoTceCe('abertas-pagina-1.html'))
const PAGINA_8 = parseListaTceCe(paginaDoTceCe('abertas-pagina-8-reabertura.html'))

function linha(idLicitacao: number): LinhaDaListaTceCe {
  const achada = [...PAGINA_1.linhas, ...PAGINA_8.linhas].find((l) => l.idLicitacao === idLicitacao)
  if (!achada) throw new Error(`linha ${idLicitacao} fora das páginas salvas`)
  return achada
}

function licitacao(idLicitacao: number, linhaDaLista: LinhaDaListaTceCe = linha(idLicitacao), html = paginaDoTceCe(`detalhe-${idLicitacao}.html`)): NormalizedTender {
  const leitura = tenderDoTceCe(linhaDaLista, parseDetalheTceCe(html))
  if (leitura.tipo !== 'licitacao') throw new Error(`esperava licitação, veio ${JSON.stringify(leitura)}`)
  return leitura.tender
}

describe('parseListaTceCe com páginas reais', () => {
  it('lê a primeira página das abertas: ids, número, município, objeto, datas e valor', () => {
    expect(PAGINA_1.ultimaPagina).toBe(113)
    expect(PAGINA_1.linhas).toHaveLength(46)
    expect(PAGINA_1.linhas[0]).toEqual({
      idProcesso: 275372,
      idLicitacao: 190360,
      numero: 'CEI 90/26SEINF',
      municipio: 'FORTALEZA',
      objeto:
        'CONTRATAÇÃO INTEGRADA DE EMPRESA PARA A PRESTAÇÃO DE SERVIÇOS DE ELABORAÇÃO DE PROJETOS BÁSICOS E EXECUTIVOS DE ENGENHARIA, BEM COMO A EXECUÇÃO DAS OBRAS DE IMPLANTAÇÃO DO VIADUTO DA AVENIDA FERNANDES TÁVORA COM AVENIDA AUGUSTO DOS ANJOS, NO MUNICÍPIO DE FORTALEZA - CE.',
      publicadoEm: '01/10/2026',
      aberturaEm: '30/12/2026',
      reaberturaEm: undefined,
      valorEstimado: 51848927.67,
    })
    expect(new Set(PAGINA_1.linhas.map((l) => l.idLicitacao)).size).toBe(46)
    expect(PAGINA_1.linhas.every((l) => linhaComSessaoFutura(l, AGORA))).toBe(true)
  })

  it('na página 8 a abertura já passou, mas a reabertura mantém a licitação como candidata', () => {
    expect(PAGINA_8.linhas).toHaveLength(50)
    const reabertas = PAGINA_8.linhas.filter((l) => l.reaberturaEm)
    expect(reabertas.map((l) => l.idLicitacao).sort()).toEqual([190170, 190245, 190246, 190249])
    const iraucuba = linha(190245)
    expect(iraucuba).toMatchObject({ municipio: 'IRAUCUBA', aberturaEm: '09/10/2026', reaberturaEm: '27/10/2026', valorEstimado: 484431.98 })
    expect(linhaComSessaoFutura(iraucuba, AGORA)).toBe(true)
    expect(PAGINA_8.linhas.filter((l) => linhaComSessaoFutura(l, AGORA)).map((l) => l.idLicitacao).sort()).toEqual([190170, 190245, 190246, 190249])
  })

  it('a página depois da última vem sem linhas, mas ainda com a paginação', () => {
    const vazia = parseListaTceCe(paginaDoTceCe('abertas-pagina-113-vazia.html'))
    expect(vazia.linhas).toEqual([])
    expect(vazia.ultimaPagina).toBe(113)
  })

  it('recusa página sem a tabela de licitações (portal mudou)', () => {
    expect(() => parseListaTceCe('<html><body><p>manutenção</p></body></html>')).toThrow(/fora do formato/)
    expect(() => parseListaTceCe(paginaDoTceCe('detalhe-190360.html'))).toThrow(/fora do formato/)
  })

  it('a assinatura da linha muda quando a reabertura ou o valor mudam', () => {
    const base = linha(190245)
    expect(assinaturaDaLinha(base)).toBe(assinaturaDaLinha({ ...base }))
    expect(assinaturaDaLinha({ ...base, reaberturaEm: '30/10/2026' })).not.toBe(assinaturaDaLinha(base))
    expect(assinaturaDaLinha({ ...base, valorEstimado: 1 })).not.toBe(assinaturaDaLinha(base))
  })
})

describe('parseDetalheTceCe + tenderDoTceCe com páginas reais', () => {
  it('concorrência de Fortaleza (190360): sessão com hora de Brasília, município com IBGE e publicação no PNCP', () => {
    const t = licitacao(190360)
    expect(t).toMatchObject({
      fonte: 'TCE_CE',
      fonteId: 'TCE-CE-190360',
      modalidade: 'CONCORRENCIA',
      situacao: 'ABERTA',
      uf: 'CE',
      municipio: 'Fortaleza',
      municipioIbge: '2304400',
      orgao: 'Prefeitura Municipal de Fortaleza',
      unidade: 'SECRETARIA MUNICIPAL DA INFRAESTRUTURA',
      valorEstimado: 51848927.67,
      numeroControle: 'CEI 90/26SEINF',
      linkEdital: 'https://municipios-licitacoes.tce.ce.gov.br/index.php/licitacao/detalhes/proc/275372/licit/190360',
    })
    expect(t.aberturaAt?.toISOString()).toBe('2026-12-30T13:00:00.000Z')
    expect(t.publicadoAt?.toISOString()).toBe('2026-10-01T03:00:00.000Z')
    expect(t.encerramentoAt).toBeUndefined()
    expect(t.rawJson).toMatchObject({
      idProcesso: 275372,
      idLicitacao: 190360,
      modalidadeNaOrigem: 'Concorrência',
      criterioDeJulgamento: 'Técnica e preço',
      plataforma: 'Compras.gov.br',
      publicadoNoPncp: true,
      processoAdministrativo: 'P231122/2026',
      regime: 'Contratação integrada',
      reaberta: false,
      arquivos: ['AVISO DE LICITAÇÃO E COMPROVANTE DE PUBLICAÇÃO', 'EDITAL Nº 11786 - SEINF'],
    })
    expect(t.rawJson.publicacoes).toContainEqual({ meio: 'Outros Meios de Publicações', especificacao: 'PNCP', data: '01/10/2026' })
  })

  it('pregão reaberto de Irauçuba (190245): a sessão vale pela reabertura e os arquivos excluídos ficam de fora', () => {
    const t = licitacao(190245)
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.municipio).toBe('Irauçuba')
    expect(t.aberturaAt?.toISOString()).toBe('2026-10-27T12:00:00.000Z')
    expect(t.rawJson).toMatchObject({
      reaberta: true,
      aberturaOriginal: '2026-10-09T12:00:00.000Z',
      republicacaoEm: '09/10/2026',
      plataforma: 'BLL Compras',
      publicadoNoPncp: false,
      local: 'www.bllcompras.org.br',
    })
    expect(t.rawJson.arquivos).toEqual(['EDITAL', 'ANEXOS AO EDITAL.pdf', 'AVISO - O POVO', 'AVISO - DOE.pdf', 'ADENDO .pdf', 'AVISO DE ADENDO - O POVO.pdf'])
  })

  it('pregão de Tabuleiro do Norte (190595) na M2A, publicado no PNCP, com várias secretarias', () => {
    const t = licitacao(190595)
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.municipio).toBe('Tabuleiro do Norte')
    expect(t.aberturaAt?.toISOString()).toBe('2026-11-03T12:30:00.000Z')
    expect(t.rawJson).toMatchObject({ plataforma: 'M2A Tecnologia', publicadoNoPncp: true })
    expect((t.rawJson.orgaos as string[]).length).toBe(11)
    expect(t.unidade!.length).toBeLessThanOrEqual(250)
  })

  it('registro de preço de Itapiúna (190521): srp pelo campo do portal e nome do município com acento', () => {
    const t = licitacao(190521)
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.srp).toBe(true)
    expect(t.municipio).toBe('Itapiúna')
    expect(t.orgao).toBe('Prefeitura Municipal de Itapiúna')
    expect(t.rawJson.plataforma).toBe('Compras.gov.br')
  })

  it('a sessão do TCE-CE conta como prazo: aberta até o dia da sessão', () => {
    const t = licitacao(190245)
    const registro = { fonte: t.fonte, situacao: t.situacao!, valorHomologado: null, encerramentoAt: null, aberturaAt: t.aberturaAt!, publicadoAt: t.publicadoAt!, createdAt: AGORA }
    expect(dataDaSessao(registro)).toEqual(t.aberturaAt)
    expect(estaAberta(registro, AGORA)).toBe(true)
    expect(estaAberta(registro, new Date('2026-10-28T03:00:00Z'))).toBe(false)
  })

  it('recusa página que não é detalhe de licitação', () => {
    expect(() => parseDetalheTceCe(paginaDoTceCe('abertas-pagina-1.html'))).toThrow(/fora do formato/)
  })

  it('ignora situação que não reconhece e licitação sem data nenhuma', () => {
    const html = paginaDoTceCe('detalhe-190360.html')
    const estranha = tenderDoTceCe(linha(190360), parseDetalheTceCe(html.replace('</strong>Aberta', '</strong>Em análise')))
    expect(estranha).toEqual({ tipo: 'ignorado', motivo: 'situação desconhecida (Em análise)' })
    const semDatas = tenderDoTceCe({ ...linha(190360), aberturaEm: undefined }, parseDetalheTceCe(html.replace('30/12/2026', '')))
    expect(semDatas).toEqual({ tipo: 'ignorado', motivo: 'sem data de abertura' })
  })

  it('lê a situação nova quando o portal fecha a licitação', () => {
    const cancelada = licitacao(190360, linha(190360), paginaDoTceCe('detalhe-190360.html').replace('</strong>Aberta', '</strong>Cancelada'))
    expect(cancelada.situacao).toBe('CANCELADA')
  })
})

describe('regras do TCE-CE', () => {
  it('modalidade: pregão presencial pelo nome ou pelo endereço físico; demais pela tabela', () => {
    expect(modalidadeDoTceCe('Pregão', 'www.bllcompras.org.br')).toBe('PREGAO_ELETRONICO')
    expect(modalidadeDoTceCe('Pregão Presencial', 'www.bllcompras.org.br')).toBe('PREGAO_PRESENCIAL')
    expect(modalidadeDoTceCe('Pregão', 'Sala da Comissão de Licitação, Rua Coronel Araújo, nº 100, Centro')).toBe('PREGAO_PRESENCIAL')
    expect(modalidadeDoTceCe('Pregão', undefined)).toBe('PREGAO_ELETRONICO')
    expect(modalidadeDoTceCe('Pregão Eletrônico', 'Sede da Prefeitura')).toBe('PREGAO_ELETRONICO')
    expect(modalidadeDoTceCe('Concorrência', 'https://compras.gov.br/')).toBe('CONCORRENCIA')
    expect(modalidadeDoTceCe('Tomada de Preços', 'Sede')).toBe('TOMADA_DE_PRECOS')
    expect(modalidadeDoTceCe('Convite', '')).toBe('CONVITE')
    expect(modalidadeDoTceCe('Concurso', '')).toBe('CONCURSO')
    expect(modalidadeDoTceCe('Diálogo Competitivo', '')).toBe('DIALOGO_COMPETITIVO')
    expect(modalidadeDoTceCe('Leilão', '')).toBe('OUTROS')
    expect(modalidadeDoTceCe('Chamada Pública', '')).toBe('OUTROS')
  })

  it('disputa eletrônica e plataforma a partir do campo Local', () => {
    expect(disputaEletronica('O certame será realizado por meio do sistema COMPRASGOV')).toBe(true)
    expect(disputaEletronica('Auditório da Prefeitura, Av. Dom Aureliano Matos')).toBe(false)
    expect(plataformaDoLocal('ATRAVÉS Da Plataforma : https://compras.m2atecnologia.com.br')).toBe('M2A Tecnologia')
    expect(plataformaDoLocal('https://www.licitacoes-e.com.br')).toBe('Licitações-e (Banco do Brasil)')
    expect(plataformaDoLocal('https://bnc.org.br')).toBe('BNC')
    expect(plataformaDoLocal('https://www.portaldecompraspublicas.com.br')).toBe('Portal de Compras Públicas')
    expect(plataformaDoLocal('Disponível em https://pregao.exemplo.com.br/sessao')).toBe('pregao.exemplo.com.br')
    expect(plataformaDoLocal('Sala de licitações')).toBeUndefined()
  })

  it('situação do portal', () => {
    expect(situacaoDoTceCe('Aberta')).toBe('ABERTA')
    expect(situacaoDoTceCe('Suspensa')).toBe('SUSPENSA')
    expect(situacaoDoTceCe('Adiada')).toBe('SUSPENSA')
    expect(situacaoDoTceCe('Cancelada')).toBe('CANCELADA')
    expect(situacaoDoTceCe('Revogada')).toBe('REVOGADA')
    expect(situacaoDoTceCe('Anulada')).toBe('ANULADA')
    expect(situacaoDoTceCe('Homologada')).toBe('HOMOLOGADA')
    expect(situacaoDoTceCe('Deserta')).toBe('ENCERRADA')
    expect(situacaoDoTceCe('Fracassada')).toBe('ENCERRADA')
    expect(situacaoDoTceCe('Concluída')).toBe('ENCERRADA')
    expect(situacaoDoTceCe('')).toBeUndefined()
  })

  it('datas: com hora no relógio de Brasília; só a data fica à meia-noite de Brasília (dia sem hora)', () => {
    expect(diaDeBrasilia('03/11/2026', '09:30')?.toISOString()).toBe('2026-11-03T12:30:00.000Z')
    expect(diaDeBrasilia('03/11/2026', '9h00')?.toISOString()).toBe('2026-11-03T12:00:00.000Z')
    const soData = diaDeBrasilia('03/11/2026')!
    expect(soData.toISOString()).toBe('2026-11-03T03:00:00.000Z')
    expect(ehDiaSemHoraDaLicitacao(soData, 'TCE_CE')).toBe(true)
    expect(diaDeBrasilia('03/11/2026', '25:00')?.toISOString()).toBe('2026-11-03T03:00:00.000Z')
    expect(diaDeBrasilia('')).toBeUndefined()
  })

  it('sessão de hoje ainda conta; a de ontem não', () => {
    const base = linha(190360)
    expect(linhaComSessaoFutura({ ...base, aberturaEm: '17/10/2026' }, AGORA)).toBe(true)
    expect(linhaComSessaoFutura({ ...base, aberturaEm: '16/10/2026' }, AGORA)).toBe(false)
    expect(linhaComSessaoFutura({ ...base, aberturaEm: '16/10/2026', reaberturaEm: '20/10/2026' }, AGORA)).toBe(true)
    expect(linhaComSessaoFutura({ ...base, aberturaEm: undefined }, AGORA)).toBe(false)
  })

  it('todos os 184 municípios do filtro do portal viram IBGE do Ceará com o nome oficial', () => {
    const html = paginaDoTceCe('abertas-pagina-1.html')
    const nomes = [...html.matchAll(/<option value="\d+">([^<]+)<\/option>/g)].map((m) => m[1])
    expect(nomes).toHaveLength(184)
    const achados = nomes.map((nome) => municipioDoCeara(nome))
    expect(achados.every((m) => m && /^23\d{5}$/.test(m.codigoIbge))).toBe(true)
    expect(new Set(achados.map((m) => m!.codigoIbge)).size).toBe(184)
    expect(municipioDoCeara('VICOSA DO CEARA')?.nome).toBe('Viçosa do Ceará')
    expect(municipioDoCeara('ITAPAJE')?.nome).toBe('Itapajé')
    expect(municipioDoCeara('BRASILIA')).toBeUndefined()
  })

  it('fonteId estável pelo id da licitação no TCE', () => {
    expect(fonteIdTceCe(190360)).toBe('TCE-CE-190360')
    expect(idDaLicitacaoTceCe('TCE-CE-190360')).toBe(190360)
    expect(idDaLicitacaoTceCe('INFRAERO-190360')).toBeUndefined()
    expect(urlDoDetalheTceCe({ idProcesso: 1, idLicitacao: 2 })).toBe('https://municipios-licitacoes.tce.ce.gov.br/index.php/licitacao/detalhes/proc/1/licit/2')
  })
})
