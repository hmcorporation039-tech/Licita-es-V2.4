import { describe, expect, it } from 'vitest'
import {
  alvosComMuitasFalhas,
  classificarEndereco,
  enderecosNovosPorAtor,
  houveSalto,
  ipsComMuitasFalhas,
  normalizarEndereco,
  severidadeGeral,
} from '../src/lib/vigiaDeSeguranca'

describe('classificarEndereco', () => {
  it('reconhece ranges privados IPv4 como internos', () => {
    expect(classificarEndereco('10.0.3.21')).toBe('interno')
    expect(classificarEndereco('172.16.0.9')).toBe('interno')
    expect(classificarEndereco('172.31.255.1')).toBe('interno')
    expect(classificarEndereco('192.168.1.1')).toBe('interno')
    expect(classificarEndereco('127.0.0.1')).toBe('interno')
  })

  it('trata 172.15 e 172.32 como externos', () => {
    expect(classificarEndereco('172.15.0.1')).toBe('externo')
    expect(classificarEndereco('172.32.0.1')).toBe('externo')
  })

  it('reconhece IPs públicos como externos', () => {
    expect(classificarEndereco('203.0.113.7')).toBe('externo')
    expect(classificarEndereco('8.8.8.8')).toBe('externo')
  })

  it('remove porta e máscara antes de classificar', () => {
    expect(classificarEndereco('203.0.113.7:52690')).toBe('externo')
    expect(classificarEndereco('10.0.0.0/8')).toBe('interno')
  })

  it('pega o primeiro IP de um x-forwarded-for', () => {
    expect(classificarEndereco('203.0.113.7, 10.0.0.1')).toBe('externo')
  })

  it('classifica IPv6 ULA e loopback como internos e público como externo', () => {
    expect(classificarEndereco('::1')).toBe('interno')
    expect(classificarEndereco('fd00::1')).toBe('interno')
    expect(classificarEndereco('fe80::1')).toBe('interno')
    expect(classificarEndereco('2804:14c:abc::1')).toBe('externo')
    expect(classificarEndereco('[2804:14c:abc::1]:5432')).toBe('externo')
  })

  it('devolve invalido para vazio ou lixo', () => {
    expect(classificarEndereco(null)).toBe('invalido')
    expect(classificarEndereco('')).toBe('invalido')
    expect(classificarEndereco('999.1.1.1')).toBe('invalido')
  })
})

describe('normalizarEndereco', () => {
  it('normaliza colchetes e porta de IPv6', () => {
    expect(normalizarEndereco('[::1]:5432')).toBe('::1')
  })
})

describe('ipsComMuitasFalhas e alvosComMuitasFalhas', () => {
  const falhas = [
    { ip: '203.0.113.7', email: 'a@x.com' },
    { ip: '203.0.113.7', email: 'b@x.com' },
    { ip: '203.0.113.7', email: 'c@x.com' },
    { ip: '10.0.0.1', email: 'a@x.com' },
    { ip: '10.0.0.1', email: 'A@X.com' },
  ]

  it('agrupa por IP acima do limite', () => {
    expect(ipsComMuitasFalhas(falhas, 3)).toEqual([{ ip: '203.0.113.7', total: 3 }])
  })

  it('agrupa por e-mail ignorando caixa', () => {
    expect(alvosComMuitasFalhas(falhas, 3)).toEqual([{ email: 'a@x.com', total: 3 }])
  })
})

describe('enderecosNovosPorAtor', () => {
  it('marca só os pares email|ip que não apareceram antes', () => {
    const conhecidos = new Set(['admin@x.com|10.0.0.1'])
    const novos = enderecosNovosPorAtor(
      [
        { email: 'admin@x.com', ip: '10.0.0.1' },
        { email: 'admin@x.com', ip: '203.0.113.7' },
        { email: 'admin@x.com', ip: '203.0.113.7' },
      ],
      conhecidos,
    )
    expect(novos).toEqual([{ email: 'admin@x.com', ip: '203.0.113.7' }])
  })
})

describe('severidadeGeral', () => {
  it('escala para o pior achado', () => {
    expect(severidadeGeral([{ severidade: 'ok' }, { severidade: 'atencao' }])).toBe('atencao')
    expect(severidadeGeral([{ severidade: 'atencao' }, { severidade: 'critico' }])).toBe('critico')
    expect(severidadeGeral([])).toBe('ok')
  })
})

describe('houveSalto', () => {
  it('ignora volumes abaixo do piso', () => {
    expect(houveSalto(5, 1, 3, 20)).toBe(false)
  })
  it('acusa salto por fator', () => {
    expect(houveSalto(60, 10, 3, 20)).toBe(true)
    expect(houveSalto(25, 10, 3, 20)).toBe(false)
  })
  it('acima do piso sem histórico conta como salto', () => {
    expect(houveSalto(30, 0, 3, 20)).toBe(true)
  })
})
