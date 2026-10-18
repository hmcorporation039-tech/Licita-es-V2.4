import { describe, expect, it } from 'vitest'
import { CandidatoDoPncpNoCeara, chaveDoNumero, motivoDaDuplicidade, numerosDoTender, palavrasDistintivas, palavrasEmComum } from '../src/services/tceCeDuplicidade'
import { NormalizedTender } from '../src/types'

const SESSAO = new Date('2026-11-03T12:30:00Z')

function doTce(over: Partial<NormalizedTender> = {}): NormalizedTender {
  return {
    fonte: 'TCE_CE',
    fonteId: 'TCE-CE-190595',
    modalidade: 'PREGAO_ELETRONICO',
    objeto: 'AQUISIÇÃO DE ÁGUA E VASILHAMES',
    uf: 'CE',
    municipio: 'Tabuleiro do Norte',
    municipioIbge: '2313104',
    aberturaAt: SESSAO,
    publicadoAt: new Date('2026-10-16T03:00:00Z'),
    numeroControle: '2026.10.09.002',
    rawJson: { numero: '2026.10.09.002', processoAdministrativo: '2026.10.09.002' },
    ...over,
  }
}

function candidato(over: Partial<CandidatoDoPncpNoCeara> = {}): CandidatoDoPncpNoCeara {
  return { aberturaAt: null, encerramentoAt: null, similaridade: 0.1, objeto: 'Aquisição de água mineral e vasilhames', numeroCompra: null, processo: null, ...over }
}

describe('chaveDoNumero', () => {
  it('ignora o ano e os zeros à esquerda, para comparar formatos diferentes do mesmo número', () => {
    expect(chaveDoNumero('2026.10.09.002', 2026)).toBe('10.9.2')
    expect(chaveDoNumero('CEI 90/26SEINF', 2026)).toBe('90')
    expect(chaveDoNumero('090/2026', 2026)).toBe('90')
    expect(chaveDoNumero('008/2026 CP', 2026)).toBe('8')
    expect(chaveDoNumero('10.022/2026-CE', 2026)).toBe('10.22')
    expect(chaveDoNumero('PE-SRP', 2026)).toBeNull()
    expect(chaveDoNumero(null, 2026)).toBeNull()
  })

  it('junta os números do registro (lista e processo administrativo) sem repetir', () => {
    expect([...numerosDoTender(doTce())]).toEqual(['10.9.2'])
    expect([...numerosDoTender(doTce({ numeroControle: '06.004/2026-CE', rawJson: { numero: '06.004/2026-CE', processoAdministrativo: 'P231122/2026' } }))]).toEqual(['6.4', '231122'])
  })
})

describe('motivoDaDuplicidade', () => {
  const numeros = numerosDoTender(doTce())

  it('objeto parecido basta (mesma regra do Querido Diário)', () => {
    expect(motivoDaDuplicidade(doTce(), numeros, candidato({ similaridade: 0.6 }))).toBe('objeto')
    expect(motivoDaDuplicidade(doTce(), numeros, candidato({ similaridade: 0.22, encerramentoAt: new Date('2026-11-03T12:00:00Z') }))).toBe('objeto')
  })

  it('mesmo número no PNCP (processo ou número da compra) com objeto minimamente parecido', () => {
    expect(motivoDaDuplicidade(doTce(), numeros, candidato({ similaridade: 0.3, processo: '2026.10.09.002' }))).toBe('numero')
    expect(motivoDaDuplicidade(doTce(), numeros, candidato({ similaridade: 0.3, numeroCompra: '10.09.002' }))).toBe('numero')
  })

  it('objeto parecido só no texto de praxe não é a mesma licitação (casos reais de 17/10/2026)', () => {
    const decoracao = doTce({ municipio: 'Novo Oriente', objeto: 'REGISTRO DE PREÇOS VISANDO FUTURAS E EVENTUAIS CONTRATAÇÕES DE EMPRESA ESPECIALIZADA EM LOCAÇÃO DE DECORAÇÃO NATALINA' })
    const software = candidato({ similaridade: 0.46, objeto: 'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA LOCAÇÃO DE SOFTWARE DE GESTÃO EM SAÚDE' })
    expect(motivoDaDuplicidade(decoracao, new Set(), software)).toBeNull()
    const radio = doTce({ municipio: 'Tamboril', objeto: 'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA FORNECIMENTO E SERVIÇO DE INSTALAÇÃO DE SISTEMA DIGITAL DE RADIOCOMUNICAÇÃO' })
    const documental = candidato({ similaridade: 0.41, encerramentoAt: SESSAO, objeto: 'CONTRATAÇÃO DE EMPRESA ESPECIALIZADA PARA PRESTAÇÃO DE SERVIÇOS DE GESTÃO DOCUMENTAL' })
    expect(motivoDaDuplicidade(radio, new Set(), documental)).toBeNull()
  })

  it('palavras distintivas deixam de fora o texto de praxe e o nome do município', () => {
    expect([...palavrasDistintivas('Contratação de empresa especializada para revitalização do acesso ao município de Aracati', 'Aracati')]).toEqual(['revitalizacao', 'acesso'])
    expect(palavrasEmComum(new Set(['revitalizacao', 'acesso']), palavrasDistintivas('EXECUÇÃO DAS OBRAS DE REVITALIZAÇÃO DO ACESSO AO MUNICIPIO DE ARACATI', 'Aracati'))).toBe(1)
    expect(palavrasEmComum(new Set(), new Set(['acesso']))).toBe(0)
  })

  it('não confunde número igual com objeto diferente, nem número diferente', () => {
    expect(motivoDaDuplicidade(doTce(), numeros, candidato({ similaridade: 0.1, processo: '2026.10.09.002' }))).toBeNull()
    expect(motivoDaDuplicidade(doTce(), numeros, candidato({ similaridade: 0.3, processo: '2026.10.09.003' }))).toBeNull()
    expect(motivoDaDuplicidade(doTce(), new Set(), candidato({ similaridade: 0.3, processo: '2026.10.09.002' }))).toBeNull()
  })
})
