import { describe, expect, it } from 'vitest'
import {
  configuracaoDoAsaas,
  dentroDoPrazoDeReembolso,
  descontoValeNoVencimento,
  documentoDoCliente,
  fimDoDiaEmBrasilia,
  hojeEmBrasilia,
  lerEventoDoAsaas,
  limiteParaPagarEmAtraso,
  motivoDoCupomRecusado,
  normalizarCodigoDoCupom,
  periodoPago,
  precoDoPlano,
  somarCiclo,
  somarDias,
  somarMeses,
  statusPelosPagamentos,
  tokenConfere,
  valorComDesconto,
} from '../src/lib/cobranca'

describe('datas da cobrança', () => {
  it('usa o dia de Brasília, não o de UTC', () => {
    expect(hojeEmBrasilia(new Date('2026-10-22T02:30:00Z'))).toBe('2026-10-21')
    expect(hojeEmBrasilia(new Date('2026-10-22T03:00:00Z'))).toBe('2026-10-22')
  })

  it('soma meses sem pular o fim do mês', () => {
    expect(somarMeses('2026-01-31', 1)).toBe('2026-02-28')
    expect(somarMeses('2028-01-31', 1)).toBe('2028-02-29')
    expect(somarMeses('2026-12-15', 1)).toBe('2027-01-15')
    expect(somarCiclo('2026-10-21', 'ANUAL')).toBe('2027-10-21')
    expect(somarDias('2026-12-30', 5)).toBe('2027-01-04')
  })

  it('o período pago vai até o próximo vencimento e o acesso ganha 5 dias de tolerância', () => {
    const { pagoAte, acessoAte } = periodoPago('2026-10-21', 'MENSAL')
    expect(pagoAte.toISOString()).toBe('2026-11-22T02:59:59.999Z')
    expect(acessoAte.toISOString()).toBe('2026-11-27T02:59:59.999Z')
    expect(limiteParaPagarEmAtraso('2026-11-21').toISOString()).toBe(fimDoDiaEmBrasilia('2026-11-26').toISOString())
  })
})

describe('valores e cupom', () => {
  it('pega o preço do ciclo e recusa plano sem preço', () => {
    const plano = { priceMonthlyCents: 14900, priceYearlyCents: 149000 }
    expect(precoDoPlano(plano, 'MENSAL')).toBe(14900)
    expect(precoDoPlano(plano, 'ANUAL')).toBe(149000)
    expect(precoDoPlano({ priceMonthlyCents: null, priceYearlyCents: 0 }, 'ANUAL')).toBeNull()
  })

  it('aplica o desconto do Fundador arredondando para o centavo', () => {
    expect(valorComDesconto(14900, 35)).toBe(9685)
    expect(valorComDesconto(32900, 35)).toBe(21385)
  })

  it('o desconto de 12 meses vale nas 12 primeiras faturas mensais e só na primeira anual', () => {
    const descontoAte = fimDoDiaEmBrasilia(somarDias(somarMeses('2026-10-21', 12), -1))
    expect(descontoValeNoVencimento(descontoAte, '2026-10-21')).toBe(true)
    expect(descontoValeNoVencimento(descontoAte, '2027-09-21')).toBe(true)
    expect(descontoValeNoVencimento(descontoAte, '2027-10-21')).toBe(false)
    expect(descontoValeNoVencimento(null, '2026-10-21')).toBe(false)
  })

  it('normaliza o código e explica por que o cupom foi recusado', () => {
    expect(normalizarCodigoDoCupom('  fundadôr-01 ')).toBe('FUNDADOR-01')
    const agora = new Date('2026-10-21T12:00:00Z')
    expect(motivoDoCupomRecusado(null, agora)).toBe('Cupom não encontrado')
    expect(motivoDoCupomRecusado({ ativo: false, validoAte: null, maxUsos: null, usos: 0 }, agora)).toBe('Cupom não encontrado')
    expect(motivoDoCupomRecusado({ ativo: true, validoAte: new Date('2026-10-20T12:00:00Z'), maxUsos: null, usos: 0 }, agora)).toBe('Este cupom venceu')
    expect(motivoDoCupomRecusado({ ativo: true, validoAte: null, maxUsos: 30, usos: 30 }, agora)).toBe('As vagas deste cupom acabaram')
    expect(motivoDoCupomRecusado({ ativo: true, validoAte: null, maxUsos: 30, usos: 29 }, agora)).toBeNull()
  })
})

describe('regras da assinatura', () => {
  it('usa o CNPJ ou o CPF só com o tamanho certo', () => {
    expect(documentoDoCliente({ cnpj: '04.003.376/0001-00', cpf: null })).toBe('04003376000100')
    expect(documentoDoCliente({ cnpj: null, cpf: '123.456.789-09' })).toBe('12345678909')
    expect(documentoDoCliente({ cnpj: '123', cpf: null })).toBeNull()
    expect(documentoDoCliente({ cnpj: null, cpf: null })).toBeNull()
  })

  it('o reembolso vale por 7 dias corridos depois do pagamento', () => {
    const pagoEm = new Date('2026-10-21T15:00:00Z')
    expect(dentroDoPrazoDeReembolso(pagoEm, new Date('2026-10-28T15:00:00Z'))).toBe(true)
    expect(dentroDoPrazoDeReembolso(pagoEm, new Date('2026-10-28T15:00:01Z'))).toBe(false)
  })

  it('a situação vem das faturas: vencida pesa mais que paga', () => {
    expect(statusPelosPagamentos([])).toBe('PENDENTE')
    expect(statusPelosPagamentos([{ status: 'PENDING' }])).toBe('PENDENTE')
    expect(statusPelosPagamentos([{ status: 'RECEIVED' }, { status: 'PENDING' }])).toBe('ATIVA')
    expect(statusPelosPagamentos([{ status: 'CONFIRMED' }, { status: 'OVERDUE' }])).toBe('ATRASADA')
  })
})

describe('avisos do Asaas', () => {
  it('lê o evento de cobrança e usa o id do evento para não processar duas vezes', () => {
    const ev = lerEventoDoAsaas({ id: 'evt_123', event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', subscription: 'sub_1', status: 'RECEIVED' } })
    expect(ev).toEqual({ id: 'evt_123', evento: 'PAYMENT_RECEIVED', cobrancaId: 'pay_1', assinaturaId: 'sub_1' })
  })

  it('sem id do evento, monta uma chave estável com cobrança, situação e data', () => {
    const corpo = { event: 'PAYMENT_OVERDUE', dateCreated: '2026-11-22 00:10:00', payment: { id: 'pay_2', status: 'OVERDUE' } }
    expect(lerEventoDoAsaas(corpo)?.id).toBe('PAYMENT_OVERDUE|pay_2|OVERDUE|2026-11-22 00:10:00')
    expect(lerEventoDoAsaas(corpo)?.id).toBe(lerEventoDoAsaas({ ...corpo })?.id)
  })

  it('lê o evento de assinatura e recusa formato estranho', () => {
    expect(lerEventoDoAsaas({ id: 'evt_9', event: 'SUBSCRIPTION_DELETED', subscription: { id: 'sub_9' } })?.assinaturaId).toBe('sub_9')
    expect(lerEventoDoAsaas(null)).toBeNull()
    expect(lerEventoDoAsaas({ event: 'payment received' })).toBeNull()
    expect(lerEventoDoAsaas('PAYMENT_RECEIVED')).toBeNull()
  })

  it('confere o token do webhook sem aceitar token curto ou vazio', () => {
    const token = 'a'.repeat(40)
    expect(tokenConfere(token, token)).toBe(true)
    expect(tokenConfere('b'.repeat(40), token)).toBe(false)
    expect(tokenConfere(undefined, token)).toBe(false)
    expect(tokenConfere('curto', 'curto')).toBe(false)
    expect(tokenConfere(token, undefined)).toBe(false)
  })
})

describe('configuração do Asaas', () => {
  it('liga só quando a chave combina com o ambiente', () => {
    expect(configuracaoDoAsaas({})).toBeNull()
    expect(configuracaoDoAsaas({ ASAAS_API_KEY: '$aact_hmlg_abc' })?.base).toBe('https://api-sandbox.asaas.com/v3')
    expect(configuracaoDoAsaas({ ASAAS_API_KEY: '$aact_prod_abc', ASAAS_AMBIENTE: 'producao' })?.base).toBe('https://api.asaas.com/v3')
    expect(configuracaoDoAsaas({ ASAAS_API_KEY: '$aact_prod_abc' })).toBeNull()
    expect(configuracaoDoAsaas({ ASAAS_API_KEY: '$aact_hmlg_abc', ASAAS_AMBIENTE: 'producao' })).toBeNull()
  })
})
