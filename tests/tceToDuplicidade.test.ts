import { describe, expect, it } from 'vitest'
import { comparacaoDoDia, conflitoComOPncp, modalidadeIncerta } from '../src/lib/repeticaoDoPncp'
import { chaveDoNumero, comparacaoDoNumeroTceCe, motivoDaDuplicidade, numerosDoTender } from '../src/services/tceCeDuplicidade'
import { parseListaTceTo, tenderDoTceTo } from '../src/services/tceToParser'
import { CandidatoDoPncpNoMunicipio } from '../src/services/queridoDiarioService'
import { NormalizedTender } from '../src/types'
import { itemReal, listaJson } from './helpers/tceTo'

function doTceTo(idProcedimento: number, campos: Record<string, unknown> = {}): NormalizedTender {
  const leitura = tenderDoTceTo(parseListaTceTo(listaJson([{ ...itemReal(idProcedimento), ...campos }])).linhas[0])
  if (leitura.tipo !== 'licitacao') throw new Error(leitura.motivo)
  return leitura.tender
}

function pncp(campos: Partial<CandidatoDoPncpNoMunicipio>): CandidatoDoPncpNoMunicipio {
  return {
    id: 'pncp',
    modalidade: 'PREGAO_ELETRONICO',
    orgao: 'MUNICIPIO DE RIO DOS BOIS',
    objeto: 'Registro de preços para futura e eventual aquisição de equipamentos',
    aberturaAt: new Date('2026-10-10T12:00:00Z'),
    encerramentoAt: new Date('2026-10-27T10:00:00Z'),
    similaridade: 0.81,
    numeroCompra: null,
    anoCompra: '2026',
    processo: null,
    ...campos,
  }
}

describe('TCE-TO — repetição do PNCP', () => {
  it('propostas que fecham às 23:59 da véspera contam como o mesmo dia da sessão (qualquer fonte)', () => {
    const aviso = { fonte: 'DIARIO_MUNICIPAL' as const, modalidade: 'CONCORRENCIA' as const, aberturaAt: new Date('2026-10-27T03:00:00Z') }
    expect(comparacaoDoDia(aviso, pncp({ aberturaAt: null, encerramentoAt: new Date('2026-10-27T02:59:00Z') }))).toBe('igual')
    expect(comparacaoDoDia(aviso, pncp({ aberturaAt: null, encerramentoAt: new Date('2026-10-26T20:00:00Z') }))).toBe('diferente')
  })

  it('a data do TCE-TO (só o dia, digitada pelo município) aceita um dia de folga; outra fonte não', () => {
    const encerramento = pncp({ aberturaAt: null, encerramentoAt: new Date('2026-10-21T10:00:00Z') })
    const sessao = new Date('2026-10-22T03:00:00Z')
    expect(comparacaoDoDia({ fonte: 'TCE_TO', modalidade: 'CONCORRENCIA', aberturaAt: sessao }, encerramento)).toBe('igual')
    expect(comparacaoDoDia({ fonte: 'TCE_TO', modalidade: 'CONCORRENCIA', aberturaAt: new Date('2026-10-23T03:00:00Z') }, encerramento)).toBe('diferente')
    expect(comparacaoDoDia({ fonte: 'DIARIO_MUNICIPAL', modalidade: 'CONCORRENCIA', aberturaAt: sessao }, encerramento)).toBe('diferente')
  })

  it('chamada pública do TCE-TO (OUTROS) compara com qualquer modalidade do PNCP', () => {
    const chamada = doTceTo(829273)
    expect(chamada.modalidade).toBe('OUTROS')
    expect(modalidadeIncerta(chamada)).toBe(true)
    expect(modalidadeIncerta({ fonte: 'DIARIO_MUNICIPAL', modalidade: 'OUTROS' })).toBe(false)
    expect(conflitoComOPncp(chamada, pncp({ modalidade: 'CONCORRENCIA', orgao: 'MUNICIPIO DE FILADELFIA' }), 'desconhecido')).toBeNull()
  })

  it('número do PNCP com o ano colado no fim ("000000012026") é o número 1', () => {
    expect(chaveDoNumero('000000012026', 2026)).toBe('1')
    expect(chaveDoNumero('90012026', 2026)).toBe('9001')
    expect(chaveDoNumero('90012025', 2026)).toBe('9001')
    expect(chaveDoNumero('1234567', 2026)).toBe('1234567')
    expect(chaveDoNumero('2026', 2026)).toBeNull()
  })

  it('Rio dos Bois (18/10/2026): o mesmo pregão no PNCP com número "000000012026" é repetição', () => {
    const tender = doTceTo(829300)
    const numeros = numerosDoTender(tender)
    expect([...numeros].sort()).toEqual(['1', '613'])
    const candidato = pncp({ numeroCompra: '000000012026', processo: null })
    const numero = comparacaoDoNumeroTceCe(tender, numeros, candidato)
    expect(numero).toBe('igual')
    expect(conflitoComOPncp(tender, candidato, numero)).toBeNull()
    expect(motivoDaDuplicidade(tender, numeros, candidato)).toBe('objeto')
  })
})
