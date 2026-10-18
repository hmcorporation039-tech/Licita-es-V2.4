import { describe, expect, it } from 'vitest'
import { entidadesCompativeisNoRs, mesmaLicitacaoNoRs } from '../src/services/tceRsDuplicidade'
import { numerosDoTender } from '../src/services/tceCeDuplicidade'
import type { CandidatoDoPncpNoMunicipio } from '../src/services/queridoDiarioService'
import { NormalizedTender } from '../src/types'

const OBJETO_DA_SES = 'AQUISIÇÃO DE BENS DA(S) FAMÍLIA(S):0884-MEDICAMENTOS DE USO HUMANO - EXCEPCIONAIS;'

function doTce(extra: Partial<NormalizedTender> & { origem: string; numero: string; processo?: string }): NormalizedTender {
  const { origem, numero, processo, ...resto } = extra
  return {
    fonte: 'TCE_RS',
    fonteId: `TCE-RS-1-2026-PCE-${numero}`,
    modalidade: 'PREGAO_ELETRONICO',
    objeto: OBJETO_DA_SES,
    uf: 'RS',
    municipio: 'Porto Alegre',
    orgao: origem,
    aberturaAt: new Date('2026-11-04T03:00:00Z'),
    publicadoAt: new Date('2026-10-07T03:00:00Z'),
    numeroControle: `${numero}/2026`,
    rawJson: { nomeDoOrgaoNaOrigem: origem, numero: `${numero}/2026`, processoAdministrativo: processo ?? null },
    ...resto,
  }
}

function doPncp(extra: Partial<CandidatoDoPncpNoMunicipio>): CandidatoDoPncpNoMunicipio {
  return {
    id: 'pncp',
    modalidade: 'PREGAO_ELETRONICO',
    orgao: 'SECRETARIA DA SAUDE',
    objeto: OBJETO_DA_SES,
    aberturaAt: new Date('2026-10-08T12:00:00Z'),
    encerramentoAt: new Date('2026-11-04T13:00:00Z'),
    similaridade: 1,
    numeroCompra: '0548',
    processo: '26/2000-9021557-0',
    ...extra,
  }
}

function veredito(tce: NormalizedTender, pncp: CandidatoDoPncpNoMunicipio) {
  return mesmaLicitacaoNoRs(tce, numerosDoTender(tce), pncp)
}

describe('TCE-RS — mesma licitação no PNCP (casos reais de 18/10/2026)', () => {
  it('SES: o mesmo número com o mesmo texto é a mesma licitação, mesmo com o nome do órgão diferente', () => {
    expect(veredito(doTce({ origem: 'SES - SECRETARIA DA SAÚDE DO RS', numero: '548' }), doPncp({}))).toBe('numero')
  })

  it('SES: texto idêntico e mesma sessão, mas número diferente, NÃO é a mesma (a SES abre dezenas de pregões iguais)', () => {
    expect(veredito(doTce({ origem: 'SES - SECRETARIA DA SAÚDE DO RS', numero: '557' }), doPncp({}))).toBeNull()
  })

  it('sem número para comparar, texto quase idêntico na mesma sessão é a mesma', () => {
    const tjrs = doTce({ origem: 'TJRS - TRIBUNAL DE JUSTIÇA', numero: '74', objeto: 'Contratação de serviços operacionais de manutenção predial' })
    const pncp = doPncp({ orgao: 'RIO GRANDE DO SUL PODER JUDICIARIO', objeto: tjrs.objeto, numeroCompra: '[21840] 74', processo: '[21840] 74/2026', similaridade: 0.97, encerramentoAt: tjrs.aberturaAt ?? null })
    expect(veredito(tjrs, pncp)).toBe('sessao')
    expect(veredito(tjrs, { ...pncp, encerramentoAt: new Date('2026-11-20T13:00:00Z') })).toBeNull()
    expect(veredito(tjrs, { ...pncp, similaridade: 0.9 })).toBeNull()
  })

  it('mesmo número com sessão adiada só de um lado continua a mesma quando o texto é parecido', () => {
    const morrinhos = doTce({ origem: 'PM DE MORRINHOS DO SUL', numero: '356', municipio: 'Morrinhos do Sul', aberturaAt: new Date('2026-10-30T03:00:00Z'), objeto: 'CONTRATAÇÃO DE EMPRESA PARA OBRA DE ENGENHARIA NA ESCOLA' })
    const pncp = doPncp({ orgao: 'MUNICIPIO DE MORRINHOS DO SUL', numeroCompra: 'CE 356', processo: '356/2026', modalidade: 'PREGAO_ELETRONICO', objeto: morrinhos.objeto, similaridade: 0.8, encerramentoAt: new Date('2026-10-19T13:00:00Z') })
    expect(veredito(morrinhos, pncp)).toBe('numero')
    expect(veredito(morrinhos, { ...pncp, similaridade: 0.5 })).toBeNull()
  })

  it('câmara só bate com câmara, prefeitura nunca bate com câmara', () => {
    const camara = doTce({ origem: 'CM DE ESTEIO', numero: '9', municipio: 'Esteio' })
    expect(entidadesCompativeisNoRs(camara, 'ESTEIO CAMARA DE VEREADORES')).toBe(true)
    expect(entidadesCompativeisNoRs(camara, 'MUNICIPIO DE ESTEIO')).toBe(false)
    const prefeitura = doTce({ origem: 'PM DE ESTEIO', numero: '9', municipio: 'Esteio' })
    expect(entidadesCompativeisNoRs(prefeitura, 'MUNICIPIO DE ESTEIO')).toBe(true)
    expect(entidadesCompativeisNoRs(prefeitura, 'ESTEIO CAMARA DE VEREADORES')).toBe(false)
    expect(entidadesCompativeisNoRs(prefeitura, 'ESTADO DO RIO GRANDE DO SUL')).toBe(false)
    expect(veredito(prefeitura, doPncp({ orgao: 'ESTEIO CAMARA DE VEREADORES', numeroCompra: '9', processo: null }))).toBeNull()
  })

  it('modalidade de outra família nunca é a mesma', () => {
    expect(veredito(doTce({ origem: 'SES - SECRETARIA DA SAÚDE DO RS', numero: '548' }), doPncp({ modalidade: 'CONCORRENCIA' }))).toBeNull()
  })
})
