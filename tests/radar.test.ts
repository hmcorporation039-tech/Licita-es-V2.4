import { beforeEach, describe, expect, it } from 'vitest'
import { contratosVencendo, janelasDeBusca, montarDossie, normalizarContrato, objetoCasaComTermos } from '../src/lib/radar'
import { buscarContratos, limparCache, PncpIndisponivelError } from '../src/services/pncpConsultaService'

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
    await buscarContratos({ niFornecedor: '22222222000122' }, HOJE, { janelas: 1, maxPaginas: 3, buscar })
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
