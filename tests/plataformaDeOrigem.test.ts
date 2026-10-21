import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { apelidoDaPlataforma, ehOProprioOrgaoPublicando, normalizarPlataformaDeOrigem, resumirPlataformas } from '../src/lib/plataformaDeOrigem'
import { parsePNCPTender } from '../src/services/pncpParser'
import { tenderContentHash } from '../src/lib/tenderContentHash'
import { alcanceNoHeroi, maisDe, plataformasNaFaixa } from '../web/src/lib/fontes'

const payloadReal = JSON.parse(readFileSync(join(__dirname, 'fixtures', 'pncp', 'proposta-central-de-compras-pb.json'), 'utf8'))

describe('nome da plataforma de origem', () => {
  it('tira espaços das pontas e junta espaços repetidos', () => {
    expect(normalizarPlataformaDeOrigem('  Equiplano   Sistemas LTDA /  Equiplano Sistemas ')).toBe('Equiplano Sistemas LTDA / Equiplano Sistemas')
    expect(normalizarPlataformaDeOrigem('BLL\tCompras\n')).toBe('BLL Compras')
  })

  it('vazio, só espaço ou tipo errado viram ausente', () => {
    expect(normalizarPlataformaDeOrigem('   ')).toBeUndefined()
    expect(normalizarPlataformaDeOrigem('')).toBeUndefined()
    expect(normalizarPlataformaDeOrigem(null)).toBeUndefined()
    expect(normalizarPlataformaDeOrigem(42)).toBeUndefined()
  })
})

describe('nome amigável da plataforma', () => {
  it('encurta os nomes mais comuns, sem depender de acento nem de caixa', () => {
    expect(apelidoDaPlataforma('Bolsa Nacional De Compras - BNC')).toBe('BNC')
    expect(apelidoDaPlataforma('Licitar Digital - Plataforma de Licitações Online')).toBe('Licitar Digital')
    expect(apelidoDaPlataforma('LicitaCon - TCE-RS')).toBe('LicitaCon (TCE-RS)')
    expect(apelidoDaPlataforma('BLL Compras')).toBe('BLL')
    expect(apelidoDaPlataforma('licitar digital - plataforma de licitacoes online')).toBe('Licitar Digital')
    expect(apelidoDaPlataforma('Portal de Compras do Estado de Minas Gerais')).toBe('Compras MG')
  })

  it('os demais ficam como vêm, já limpos', () => {
    expect(apelidoDaPlataforma('Compras.gov.br')).toBe('Compras.gov.br')
    expect(apelidoDaPlataforma('  Fiorilli   Software ')).toBe('Fiorilli Software')
  })

  it('reconhece quando quem publica no PNCP é o próprio órgão, não uma plataforma', () => {
    expect(ehOProprioOrgaoPublicando('PREFEITURA DO MUNICÍPIO DE MAUÁ')).toBe(true)
    expect(ehOProprioOrgaoPublicando('MUNICIPIO DE ESTEIO')).toBe(true)
    expect(ehOProprioOrgaoPublicando('Prefeitura Municipal do Rio Grande')).toBe(true)
    expect(ehOProprioOrgaoPublicando('Tribunal de Justiça do Estado do Rio Grande do Sul')).toBe(true)
    expect(ehOProprioOrgaoPublicando('MINISTÉRIO PÚBLICO DO ESTADO DE RONDÔNIA')).toBe(true)
    expect(ehOProprioOrgaoPublicando('Compras.gov.br')).toBe(false)
    expect(ehOProprioOrgaoPublicando('Portal de Compras do Estado de Minas Gerais')).toBe(false)
    expect(ehOProprioOrgaoPublicando('Secretaria de Administração do Estado de Pernambuco')).toBe(false)
  })

  it('resume: conta plataformas distintas, ordena pelas que têm mais licitações e corta em 12', () => {
    const grupos = [
      { nome: 'Compras.gov.br', licitacoes: 900 },
      { nome: 'Bolsa Nacional De Compras - BNC', licitacoes: 120 },
      { nome: 'BLL Compras', licitacoes: 150 },
      { nome: 'PREFEITURA DO MUNICÍPIO DE MAUÁ', licitacoes: 500 },
      { nome: null, licitacoes: 999 },
      { nome: 'Nada Aberto', licitacoes: 0 },
      ...Array.from({ length: 12 }, (_, i) => ({ nome: `Sistema ${String(i).padStart(2, '0')}`, licitacoes: 10 })),
    ]
    const resumo = resumirPlataformas(grupos)
    expect(resumo.plataformas).toBe(15)
    expect(resumo.principaisPlataformas).toHaveLength(12)
    expect(resumo.principaisPlataformas.slice(0, 4)).toEqual(['Compras.gov.br', 'BLL', 'BNC', 'Sistema 00'])
    expect(resumo.principaisPlataformas).not.toContain('PREFEITURA DO MUNICÍPIO DE MAUÁ')
  })

  it('soma no mesmo apelido grafias diferentes da mesma plataforma', () => {
    const resumo = resumirPlataformas([
      { nome: 'BLL Compras', licitacoes: 3 },
      { nome: 'BLL  Compras ', licitacoes: 2 },
      { nome: 'Compras.gov.br', licitacoes: 4 },
    ])
    expect(resumo).toEqual({ plataformas: 2, principaisPlataformas: ['BLL', 'Compras.gov.br'] })
  })

  it('sem nenhuma plataforma, zero e lista vazia', () => {
    expect(resumirPlataformas([])).toEqual({ plataformas: 0, principaisPlataformas: [] })
  })
})

describe('parser do PNCP com payload real de /v1/contratacoes/proposta', () => {
  it('grava usuarioNome em plataformaDeOrigem e o link de origem no edital', () => {
    const tender = parsePNCPTender(payloadReal)
    expect(tender.plataformaDeOrigem).toBe('Central de Compras da Paraíba/PB')
    expect(tender.linkEdital).toBe(payloadReal.linkSistemaOrigem)
    expect(tender.orgaoCnpj).toBe('08761140000194')
    expect(tender.rawJson).not.toHaveProperty('usuarioNome')
  })

  it('limpa os espaços e deixa ausente quando o PNCP não informa', () => {
    expect(parsePNCPTender({ ...payloadReal, usuarioNome: '  BLL   Compras ' }).plataformaDeOrigem).toBe('BLL Compras')
    expect(parsePNCPTender({ ...payloadReal, usuarioNome: undefined }).plataformaDeOrigem).toBeUndefined()
    expect(parsePNCPTender({ ...payloadReal, usuarioNome: '' }).plataformaDeOrigem).toBeUndefined()
  })

  it('a plataforma não entra na impressão digital: preencher a coluna não vira "licitação alterada"', () => {
    const comPlataforma = parsePNCPTender(payloadReal)
    const semPlataforma = parsePNCPTender({ ...payloadReal, usuarioNome: undefined })
    expect(tenderContentHash(comPlataforma)).toBe(tenderContentHash(semPlataforma))
  })
})

describe('números da página de entrada', () => {
  it('"mais de" arredonda para baixo nas centenas, em pt-BR, e nunca promete o número exato', () => {
    expect(maisDe(8_563)).toBe('mais de 8.500')
    expect(maisDe(8_500)).toBe('mais de 8.400')
    expect(maisDe(8_501)).toBe('mais de 8.500')
    expect(maisDe(12_345)).toBe('mais de 12.300')
    expect(maisDe(101)).toBe('mais de 100')
    expect(maisDe(57)).toBe('57')
    expect(maisDe(1)).toBe('1')
  })

  it('"mais de" sem número válido devolve nulo', () => {
    expect(maisDe(0)).toBeNull()
    expect(maisDe(null)).toBeNull()
    expect(maisDe(undefined)).toBeNull()
    expect(maisDe(Number.NaN)).toBeNull()
    expect(maisDe('8500')).toBeNull()
  })

  it('frase do herói com órgãos e municípios, e sem órgãos cai para o texto antigo', () => {
    expect(alcanceNoHeroi(8_563, 4_260)).toBe('de mais de 8.500 órgãos públicos em 4.260 municípios')
    expect(alcanceNoHeroi(8_563, undefined)).toBe('de mais de 8.500 órgãos públicos')
    expect(alcanceNoHeroi(1, 1)).toBe('de 1 órgão público em 1 município')
    expect(alcanceNoHeroi(0, 4_260)).toBeNull()
    expect(alcanceNoHeroi(undefined, 4_260)).toBeNull()
  })

  it('faixa das plataformas: até 8 nomes curtos, e nada quando a coluna ainda não se preencheu', () => {
    const principais = ['Compras.gov.br', 'Portal de Compras Públicas', 'Licitanet', 'BNC', 'AZ INFORMATICA LTDA', 'BLL', 'Secretaria do Planejamento e Gestão do Ceará', 'IPM Sistemas', 'Licitar Digital', 'Compras MG', 'BBMNET', 'Elotech']
    expect(plataformasNaFaixa(212, principais)).toEqual({
      total: 212,
      nomes: ['Compras.gov.br', 'Portal de Compras Públicas', 'Licitanet', 'BNC', 'BLL', 'IPM Sistemas', 'Licitar Digital', 'Compras MG'],
    })
    expect(plataformasNaFaixa(0, principais)).toBeNull()
    expect(plataformasNaFaixa(null, principais)).toBeNull()
    expect(plataformasNaFaixa(undefined, undefined)).toBeNull()
    expect(plataformasNaFaixa(3, null)).toEqual({ total: 3, nomes: [] })
  })
})
