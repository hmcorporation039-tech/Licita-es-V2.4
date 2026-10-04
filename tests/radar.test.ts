import { beforeEach, describe, expect, it } from 'vitest'
import { contratosVencendo, janelasDeBusca, montarDossie, normalizarContrato, objetoCasaComTermos } from '../src/lib/radar'
import { buscarContratos, buscarContratosDoFornecedor, limparCache, PncpIndisponivelError } from '../src/services/pncpConsultaService'
import { normalizarContratoDaBusca } from '../src/lib/radar'

const bruto = (o: Record<string, unknown> = {}) => ({
  numeroControlePNCP: 'c-1',
  orgaoEntidade: { cnpj: '11111111000111', razaoSocial: 'PREFEITURA X' },
  unidadeOrgao: { ufSigla: 'GO', municipioNome: 'Goiânia' },
  niFornecedor: '22222222000122',
  nomeRazaoSocialFornecedor: 'ACME LTDA',
  objetoContrato: 'Serviço de limpeza e conservação predial',
  valorGlobal: 1000,
  dataAssinatura: '2026-01-10',
  dataVigenciaFim: '2026-11-04',
  categoriaProcesso: { nome: 'Serviços' },
  tipoContrato: { nome: 'Contrato' },
  ...o,
})

const HOJE = '2026-10-04'

describe('normalizarContrato', () => {
  it('extrai os campos e ignora registro sem identificador', () => {
    const c = normalizarContrato(bruto())!
    expect(c.orgao).toEqual({ cnpj: '11111111000111', nome: 'PREFEITURA X', uf: 'GO', municipio: 'Goiânia' })
    expect(c.vigenciaFim).toBe('2026-11-04')
    expect(c.valorGlobal).toBe(1000)
    expect(normalizarContrato({})).toBeNull()
    expect(normalizarContrato(null)).toBeNull()
  })

  it('valor ou data inválidos viram 0/null, sem quebrar', () => {
    const c = normalizarContrato(bruto({ valorGlobal: 'x', dataVigenciaFim: 'ontem' }))!
    expect(c.valorGlobal).toBe(0)
    expect(c.vigenciaFim).toBeNull()
  })
})

describe('contratosVencendo', () => {
  const lista = [
    bruto({ numeroControlePNCP: 'a', dataVigenciaFim: '2026-12-01' }), // 58 dias
    bruto({ numeroControlePNCP: 'b', dataVigenciaFim: '2026-10-10' }), // 6 dias
    bruto({ numeroControlePNCP: 'c', dataVigenciaFim: '2026-10-03' }), // já venceu
    bruto({ numeroControlePNCP: 'd', dataVigenciaFim: '2028-01-01' }), // longe
    bruto({ numeroControlePNCP: 'e', dataVigenciaFim: '2026-10-20', objetoContrato: 'Aquisição de notebooks' }),
    bruto({ numeroControlePNCP: 'b', dataVigenciaFim: '2026-10-10' }), // duplicado
    bruto({ numeroControlePNCP: 'f', dataVigenciaFim: null }),
  ].map((b) => normalizarContrato(b)!)

  it('filtra pela janela, ordena do mais próximo e remove duplicados', () => {
    const r = contratosVencendo(lista, HOJE, 120)
    expect(r.map((c) => c.id)).toEqual(['b', 'e', 'a'])
    expect(r[0].diasRestantes).toBe(6)
  })

  it('marca o que está no ramo da empresa (sem acento e sem diferenciar maiúsculas)', () => {
    const r = contratosVencendo(lista, HOJE, 120, ['LIMPEZA', 'notebook'])
    expect(r.find((c) => c.id === 'e')!.noSeuRamo).toBe(true)
    expect(r.find((c) => c.id === 'a')!.noSeuRamo).toBe(true)
    expect(contratosVencendo(lista, HOJE, 120, ['jardinagem']).every((c) => !c.noSeuRamo)).toBe(true)
    expect(contratosVencendo(lista, HOJE, 120).every((c) => !c.noSeuRamo)).toBe(true)
  })

  it('termos curtos demais não casam com tudo', () => {
    expect(objetoCasaComTermos('Serviço de limpeza', ['de'])).toBe(false)
    expect(objetoCasaComTermos('Manutenção elétrica', ['manutencao'])).toBe(true)
  })
})

describe('montarDossie', () => {
  const contratos = [
    bruto({ numeroControlePNCP: '1', valorGlobal: 500, dataAssinatura: '2025-03-01' }),
    bruto({ numeroControlePNCP: '2', valorGlobal: 1500, dataAssinatura: '2026-02-01', orgaoEntidade: { cnpj: '333', razaoSocial: 'ESTADO Y' }, unidadeOrgao: { ufSigla: 'DF' } }),
    bruto({ numeroControlePNCP: '2', valorGlobal: 1500, dataAssinatura: '2026-02-01', orgaoEntidade: { cnpj: '333', razaoSocial: 'ESTADO Y' }, unidadeOrgao: { ufSigla: 'DF' } }), // repetido (idêntico)
    bruto({ numeroControlePNCP: '3', valorGlobal: 200, dataAssinatura: '2026-06-01', dataVigenciaFim: '2026-11-01', categoriaProcesso: { nome: 'Obras' } }),
  ].map((b) => normalizarContrato(b)!)

  it('totaliza, agrupa e ordena por valor', () => {
    const d = montarDossie(contratos, HOJE)
    expect(d.totalDeContratos).toBe(3)
    expect(d.valorTotal).toBe(2200)
    expect(d.fornecedor?.nome).toBe('ACME LTDA')
    expect(d.primeiraAssinatura).toBe('2025-03-01')
    expect(d.ultimaAssinatura).toBe('2026-06-01')
    expect(d.porOrgao[0]).toMatchObject({ cnpj: '333', nome: 'ESTADO Y', valor: 1500 })
    expect(d.porUf.map((u) => u.uf)).toEqual(['DF', 'GO'])
    expect(d.porCategoria.map((c) => c.categoria).sort()).toEqual(['Obras', 'Serviços'])
    expect(d.ultimosContratos[0].id).toBe('3')
    expect(d.vencendoEm90Dias.map((c) => c.id)).toEqual(['3', '2', '1']) // mais próximo primeiro; empate pelo maior valor
  })

  it('sem contratos devolve um dossiê vazio', () => {
    const d = montarDossie([], HOJE)
    expect(d).toMatchObject({ fornecedor: null, totalDeContratos: 0, valorTotal: 0, primeiraAssinatura: null })
  })
})

describe('janelasDeBusca', () => {
  it('janelas de até 364 dias, contíguas, da mais recente para a mais antiga', () => {
    const j = janelasDeBusca(HOJE, 2)
    expect(j[0].final).toBe('20261004')
    for (const x of j) {
      const dias = (Date.parse(x.final.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) - Date.parse(x.inicial.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3'))) / 86_400_000
      expect(dias).toBeLessThanOrEqual(364)
    }
    // A janela mais antiga termina exatamente no dia anterior ao início da mais recente (sem buraco nem sobreposição).
    const antes = new Date(Date.parse(j[0].inicial.replace(/(\d{4})(\d{2})(\d{2})/, '$1-$2-$3')) - 86_400_000)
    expect(j[1].final).toBe(antes.toISOString().slice(0, 10).replace(/-/g, ''))
  })
})

describe('buscarContratos', () => {
  beforeEach(() => limparCache())

  it('percorre as páginas, consulta cada janela e usa cache na repetição', async () => {
    const chamadas: Record<string, string | number>[] = []
    const buscar = async (_u: string, p: Record<string, string | number>) => {
      chamadas.push(p)
      return { data: [bruto({ numeroControlePNCP: `p${p.pagina}-${p.dataInicial}` })], totalPaginas: 2 }
    }
    const r = await buscarContratos({ cnpjOrgao: '11111111000111' }, HOJE, { janelas: 2, buscar })
    expect(chamadas).toHaveLength(4) // 2 janelas × 2 páginas
    expect(r).toHaveLength(4)
    expect(chamadas.every((c) => c.cnpjOrgao === '11111111000111' && c.tamanhoPagina === 500)).toBe(true)
    await buscarContratos({ cnpjOrgao: '11111111000111' }, HOJE, { janelas: 2, buscar })
    expect(chamadas).toHaveLength(4)
  })

  it('respeita o máximo de páginas', async () => {
    let n = 0
    const buscar = async () => {
      n++
      return { data: [], totalPaginas: 99 }
    }
    await buscarContratos({ cnpjOrgao: '11111111000111' }, HOJE, { janelas: 1, maxPaginas: 3, buscar })
    expect(n).toBe(3)
  })

  it('falha do PNCP vira erro claro, sem vazar detalhe interno', async () => {
    const buscar = async () => {
      throw new Error('ECONNRESET segredo')
    }
    const p = buscarContratos({ cnpjOrgao: '1' }, HOJE, { buscar })
    await expect(p).rejects.toBeInstanceOf(PncpIndisponivelError)
    await expect(p).rejects.not.toThrow(/segredo/)
  })
})

describe('sugerirPerfil', () => {
  const mk = (i: number, objeto: string, uf = 'GO', valor = 1000 * (i + 1)) =>
    normalizarContrato(bruto({ numeroControlePNCP: `p${i}`, objetoContrato: objeto, unidadeOrgao: { ufSigla: uf }, valorGlobal: valor }))!

  it('sugere termos frequentes, ignora genéricos e conta 1x por contrato', async () => {
    const { sugerirPerfil } = await import('../src/lib/radar')
    const cs = [
      mk(0, 'Contratação de empresa especializada em limpeza e conservação, limpeza geral'),
      mk(1, 'Serviço de limpeza hospitalar'),
      mk(2, 'Fornecimento de uniformes escolares', 'DF'),
      mk(3, 'Prestação de serviços de limpeza predial'),
      mk(4, 'Aquisição de uniformes'),
    ]
    const p = sugerirPerfil(cs)
    expect(p.totalDeContratos).toBe(5)
    expect(p.palavrasChave[0]).toEqual({ termo: 'limpeza', ocorrencias: 3 })
    expect(p.palavrasChave.map((x) => x.termo)).toContain('uniformes')
    expect(p.palavrasChave.map((x) => x.termo)).not.toContain('contratacao')
    expect(p.ufs).toEqual(['GO', 'DF'])
    expect(p.faixaDeValor).toEqual({ minimo: 1000, maximo: 5000 })
  })

  it('sem histórico não sugere nada; poucos valores não geram faixa', async () => {
    const { sugerirPerfil } = await import('../src/lib/radar')
    expect(sugerirPerfil([])).toMatchObject({ totalDeContratos: 0, palavrasChave: [], ufs: [], faixaDeValor: null })
  })
})

describe('contratos do fornecedor (busca do portal PNCP)', () => {
  beforeEach(() => limparCache())
  const item = (o: Record<string, unknown> = {}) => ({
    numero_controle_pncp: 'x-1', orgao_cnpj: '111', orgao_nome: 'ESTADO X', uf: 'CE', municipio_nome: 'Fortaleza',
    fornecedor_ni: '05477107000149', fornecedor_nome: 'ORTOPEDIA BRASIL LTDA', description: 'AQUISICAO DE OPME\r\nNUP: 1',
    valor_global: 1350, data_assinatura: '2026-09-29', data_inicio_vigencia: '2026-09-29', data_fim_vigencia: '2026-12-31',
    modalidade_licitacao_nome: 'Pregão - Eletrônico', tipo_contrato_nome: 'Empenho', cancelado: false, ...o,
  })

  it('normaliza o item da busca; cancelado e sem id ficam de fora', () => {
    const c = normalizarContratoDaBusca(item())!
    expect(c).toMatchObject({ id: 'x-1', fornecedor: { ni: '05477107000149' }, objeto: 'AQUISICAO DE OPME NUP: 1', categoria: 'Pregão - Eletrônico', vigenciaFim: '2026-12-31' })
    expect(normalizarContratoDaBusca(item({ cancelado: true }))).toBeNull()
    expect(normalizarContratoDaBusca(item({ numero_controle_pncp: '' }))).toBeNull()
  })

  it('só aceita contratos DESTE fornecedor (o CNPJ pode aparecer em outro campo da busca)', async () => {
    const buscar = async (_u: string, p: Record<string, string | number>) => {
      expect(p).toMatchObject({ q: '05477107000149', tipos_documento: 'contrato', tam_pagina: 500 })
      return { total: 3, items: [item(), item({ numero_controle_pncp: 'x-2', fornecedor_ni: '99999999000199' }), item({ numero_controle_pncp: 'x-3' })] }
    }
    const r = await buscarContratosDoFornecedor('05477107000149', { buscar })
    expect(r.map((c) => c.id)).toEqual(['x-1', 'x-3'])
  })

  it('resposta vazia/instável: tenta de novo; 3 falhas seguidas viram erro claro', async () => {
    let n = 0
    const instavel = async () => (++n < 3 ? '' : { total: 1, items: [item()] })
    expect(await buscarContratosDoFornecedor('05477107000149', { buscar: instavel, esperaMs: 0 })).toHaveLength(1)
    expect(n).toBe(3)
    limparCache()
    await expect(buscarContratosDoFornecedor('05477107000149', { buscar: async () => '', esperaMs: 0 })).rejects.toBeInstanceOf(PncpIndisponivelError)
  })

  it('pagina até acabar ou até o teto de páginas', async () => {
    const paginas: number[] = []
    const cheia = Array.from({ length: 500 }, (_, i) => item({ numero_controle_pncp: 'p' + i }))
    const buscar = async (_u: string, p: Record<string, string | number>) => {
      paginas.push(Number(p.pagina))
      return { total: 5000, items: cheia }
    }
    await buscarContratosDoFornecedor('05477107000149', { buscar, maxPaginas: 2 })
    expect(paginas).toEqual([1, 2])
  })
})
