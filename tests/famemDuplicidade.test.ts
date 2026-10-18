import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { FONTES_DE_DIARIO, FONTES_QUE_REPETEM_O_PNCP, RegistroDeOutraFonte, ehRepeticaoDaLicitacaoDoPncp } from '../src/services/duplicataEntreFontes'
import { equivalenteNoQueridoDiario } from '../src/services/diarioMunicipalService'
import { avisosDaPublicacao, lerListaDaFamem, lerPublicacaoDaFamem, municipioDaPublicacao } from '../src/services/famemParser'
import { dataDaSessao } from '../src/lib/dataDaSessao'
import { marcasDoRegistro } from '../src/lib/marcasDasFontes'
import { NormalizedTender } from '../src/types'

const PASTA = join(__dirname, 'fixtures', 'famem')
const fixture = (nome: string) => readFileSync(join(PASTA, nome), 'utf-8')
const AGORA = new Date('2026-10-18T15:00:00Z')

function daFixture(id: string): NormalizedTender {
  const publicacao = lerListaDaFamem(fixture('lista-de-publicacoes.json')).publicacoes.find((p) => p.id === id)!
  const materia = lerPublicacaoDaFamem(fixture(`publicacao-${id}.html`))!
  return avisosDaPublicacao(materia, publicacao, municipioDaPublicacao(publicacao.entidade)!, AGORA).tenders[0]
}

function comoRegistro(t: NormalizedTender): RegistroDeOutraFonte {
  return {
    id: 'famem',
    fonte: t.fonte,
    fonteId: t.fonteId,
    modalidade: t.modalidade,
    objeto: t.objeto,
    uf: t.uf ?? null,
    municipio: t.municipio ?? null,
    municipioIbge: t.municipioIbge ?? null,
    orgao: t.orgao ?? null,
    aberturaAt: t.aberturaAt ?? null,
    publicadoAt: t.publicadoAt ?? null,
    numeroControle: t.numeroControle ?? null,
    rawJson: t.rawJson,
    createdAt: AGORA,
  } as RegistroDeOutraFonte
}

function doPncp(campos: Partial<NormalizedTender>): NormalizedTender {
  return {
    fonte: 'PNCP',
    fonteId: 'pncp',
    modalidade: 'PREGAO_ELETRONICO',
    objeto: 'Aquisição de tratores e implementos agrícolas',
    uf: 'MA',
    municipio: 'Riachão',
    municipioIbge: '2109502',
    orgao: 'MUNICIPIO DE RIACHAO',
    aberturaAt: new Date('2026-10-15T03:00:00Z'),
    encerramentoAt: new Date('2026-11-04T11:59:00Z'),
    rawJson: { numeroCompra: '90020', anoCompra: 2026 },
    ...campos,
  }
}

describe('FAMEM — lugar nas listas compartilhadas', () => {
  it('é uma fonte que repete o PNCP e um diário', () => {
    expect(FONTES_QUE_REPETEM_O_PNCP).toContain('FAMEM')
    expect(FONTES_DE_DIARIO).toContain('FAMEM')
  })

  it('a data da sessão é a abertura, e a marca é a da FAMEM', () => {
    const aberturaAt = new Date('2026-11-04T12:00:00Z')
    expect(dataDaSessao({ fonte: 'FAMEM', aberturaAt, encerramentoAt: null })).toBe(aberturaAt)
    expect(marcasDoRegistro('FAMEM', 'Prefeitura Municipal de Riachão')).toEqual(['FAMEM'])
  })

  it('o mesmo aviso no Querido Diário tem o prefixo QD', () => {
    expect(equivalenteNoQueridoDiario('FAMEM-2109502:PREGAO:90020-2026')).toBe('QD-2109502:PREGAO:90020-2026')
  })
})

describe('FAMEM — repetição do PNCP pela regra estrita', () => {
  const riachao = comoRegistro(daFixture('713683'))

  it('mesmo número, mesmo dia e objeto parecido: esconde', () => {
    expect(ehRepeticaoDaLicitacaoDoPncp(riachao, doPncp({}), 0.5)).toBe(true)
  })

  it('objeto muito parecido mas número diferente: não esconde', () => {
    expect(ehRepeticaoDaLicitacaoDoPncp(riachao, doPncp({ rawJson: { numeroCompra: '90021', anoCompra: 2026 } }), 0.95)).toBe(false)
  })

  it('mesmo número em outra modalidade, ou sessão em outro dia: não esconde', () => {
    expect(ehRepeticaoDaLicitacaoDoPncp(riachao, doPncp({ modalidade: 'CONCORRENCIA' }), 0.9)).toBe(false)
    expect(ehRepeticaoDaLicitacaoDoPncp(riachao, doPncp({ encerramentoAt: new Date('2026-11-10T11:59:00Z') }), 0.9)).toBe(false)
  })

  it('semelhança fraca sem número nem dia confirmando: não esconde', () => {
    expect(ehRepeticaoDaLicitacaoDoPncp(riachao, doPncp({ rawJson: {}, aberturaAt: undefined, encerramentoAt: undefined }), 0.5)).toBe(false)
  })

  it('órgão de outro tipo (câmara × prefeitura): não esconde', () => {
    expect(ehRepeticaoDaLicitacaoDoPncp(riachao, doPncp({ orgao: 'CAMARA MUNICIPAL DE RIACHAO' }), 0.9)).toBe(false)
  })
})
