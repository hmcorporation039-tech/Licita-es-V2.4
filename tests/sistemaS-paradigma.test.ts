import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { criarUnidadeParadigma, sescDN, sescRJ, sescRS, sescSP } from '../src/services/sescRegional/paradigma'
import {
  FEDERACOES_NO_PARADIGMA,
  UNIDADES_DA_INDUSTRIA_NO_PARADIGMA,
  contarProcessosDoParadigma,
  dataDoParadigmaEmBrasilia,
  empresaDaIndustria,
} from '../src/services/sistemaS/paradigmaDaIndustria'

const lerSistemaS = (nome: string) => readFileSync(join(__dirname, 'fixtures/sistemaS', nome), 'utf8')
const lerSesc = (nome: string) => readFileSync(join(__dirname, 'fixtures/sesc', nome), 'utf8')
const AGORA = new Date('2026-10-15T15:00:00Z')
const unidade = (uf: string) => UNIDADES_DA_INDUSTRIA_NO_PARADIGMA.find((u) => u.uf === uf)!
const parse = (uf: string) => unidade(uf).parse(lerSistemaS(`paradigma-${uf.toLowerCase()}.json`), { url: unidade(uf).urls(AGORA)[0], agora: AGORA })
const dataLocal = (ano: number, mes: number, dia: number, hora: number, minuto = 0) => `/Date(${Date.UTC(ano, mes - 1, dia, hora, minuto)})/`

describe('Paradigma — saída do SESC não muda com a generalização', () => {
  it('as cinco unidades do SESC produzem exatamente o mesmo resultado de antes', () => {
    const agoraSesc = new Date('2026-09-30T12:00:00-03:00')
    const ctx = (url: string) => ({ url, agora: agoraSesc })
    const misto = criarUnidadeParadigma({ uf: 'RS', nome: 'Sesc Rio Grande do Sul', base: 'https://x.test/app' })
    const atual = {
      dn: sescDN.parse(lerSesc('paradigma-dn.json'), ctx(sescDN.urls(agoraSesc)[0])),
      rj: sescRJ.parse(lerSesc('paradigma-rj.json'), ctx(sescRJ.urls(agoraSesc)[0])),
      sp: sescSP.parse(lerSesc('paradigma-sp.json'), ctx(sescSP.urls(agoraSesc)[0])),
      rsComoDn: sescRS.parse(lerSesc('paradigma-dn.json'), ctx(sescRS.urls(agoraSesc)[0])),
      misto: misto.parse(lerSesc('paradigma-dn.json'), ctx('https://x.test/app')),
    }
    const dois = (n: number) => String(n).padStart(2, '0')
    const local = (d: Date) => {
      const b = new Date(d.getTime() - 3 * 3_600_000)
      return `${b.getUTCFullYear()}-${dois(b.getUTCMonth() + 1)}-${dois(b.getUTCDate())} ${dois(b.getUTCHours())}:${dois(b.getUTCMinutes())}`
    }
    const serial = JSON.stringify(
      atual,
      function (this: Record<string, unknown>, k, v) {
        const o = this[k]
        return o instanceof Date ? local(o) : v
      },
      1
    )
    expect(serial + '\n').toBe(lerSistemaS('paradigma-sesc-saida-original.json').replace(/\r\n/g, '\n'))
    expect(atual.dn.every((t) => t.fonte === 'SESC_REGIONAL' && t.fonteId.startsWith('SESC-DN-'))).toBe(true)
  })
})

describe('Paradigma — federações da indústria', () => {
  it('MG: mantém SESI, SENAI, IEL e a federação, descarta prazo vencido', () => {
    const r = parse('MG')
    expect(r.map((t) => [t.fonteId, t.orgao]).sort()).toEqual([
      ['IND-PDG-MG-15641', 'SENAI-MG'],
      ['IND-PDG-MG-16059', 'SESI-MG'],
      ['IND-PDG-MG-16060', 'IEL-MG'],
      ['IND-PDG-MG-16063', 'FIEMG'],
    ])
    for (const t of r) {
      expect(t.fonte).toBe('SISTEMA_S')
      expect(t.uf).toBe('MG')
      expect(t.linkEdital).toBe('https://compras.fiemg.com.br/portal/Mural.aspx')
    }
  })

  it('MG: modalidade pelo regulamento e prazo lido no horário de Brasília', () => {
    const r = parse('MG')
    const comDisputa = r.find((t) => t.fonteId === 'IND-PDG-MG-15641')!
    expect(comDisputa.modalidade).toBe('OUTROS')
    expect(comDisputa.encerramentoAt?.toISOString()).toBe('2026-10-23T21:00:00.000Z')
    expect(r.find((t) => t.fonteId === 'IND-PDG-MG-16063')!.modalidade).toBe('DISPENSA_SEM_DISPUTA')
    expect(r.find((t) => t.fonteId === 'IND-PDG-MG-16060')!.unidade).toBe('IEL/NRMG - SEDE')
  })

  it('RJ: extrai o CNPJ do nome e reconhece os institutos do SENAI', () => {
    const r = parse('RJ')
    const isi = r.find((t) => t.fonteId === 'IND-PDG-RJ-5182')!
    expect(isi.orgao).toBe('SENAI-RJ')
    expect(isi.orgaoCnpj).toBe('03848688006355')
    expect(isi.unidade).toBe('ISI QUÍMICA VERDE')
    expect(isi.modalidade).toBe('DISPENSA_COM_DISPUTA')
    expect(r.find((t) => t.fonteId === 'IND-PDG-RJ-3947')!.orgao).toBe('SESI-RJ')
  })

  it('MT: descarta análise de lances, condomínio e prazo vencido; mantém federação e cotação', () => {
    const r = parse('MT')
    expect(r.map((t) => [t.fonteId, t.orgao, t.modalidade]).sort()).toEqual([
      ['IND-PDG-MT-57279', 'SESI-MT', 'DISPENSA_COM_DISPUTA'],
      ['IND-PDG-MT-815', 'FIEMT', 'OUTROS'],
      ['IND-PDG-MT-820', 'SESI-MT', 'OUTROS'],
    ])
  })

  it('ES: descarta entidades fora do Sistema S (CINDES)', () => {
    expect(parse('ES').map((t) => t.orgao).sort()).toEqual(['IEL-ES', 'SENAI-ES'])
  })

  it('descarta prazo que já passou hoje (o Paradigma informa a hora do fim)', () => {
    const json = JSON.stringify({
      d: [
        { nCdProcesso: 1, sDsObjeto: 'passou', sNmEmpresa: 'SENAI/DRMG', sDsSituacao: 'Em andamento', tDtFinal: dataLocal(2026, 10, 15, 11) },
        { nCdProcesso: 2, sDsObjeto: 'ainda vai', sNmEmpresa: 'SENAI/DRMG', sDsSituacao: 'Em andamento', tDtFinal: dataLocal(2026, 10, 15, 13) },
      ],
    })
    expect(unidade('MG').parse(json, { url: unidade('MG').urls(AGORA)[0], agora: AGORA }).map((t) => t.objeto)).toEqual(['ainda vai'])
  })

  it('classifica a empresa pelo nome', () => {
    const mg = { uf: 'MG', sigla: 'FIEMG' }
    expect(empresaDaIndustria('SESI/SENAI', { uf: 'MS', sigla: 'FIEMS' })?.orgao).toBe('SESI/SENAI-MS')
    expect(empresaDaIndustria('SERVIÇO NACIONAL APRENDIZAGEM INDUSTRIAL - DR', { uf: 'RS', sigla: 'FIERGS' })?.orgao).toBe('SENAI-RS')
    expect(empresaDaIndustria('CENTRO DAS INDÚSTRIAS DO ESTADO DO RIO GRANDE DO SUL - DR', { uf: 'RS', sigla: 'FIERGS' })).toBeNull()
    expect(empresaDaIndustria('FEDERAÇÃO DAS INDUSTRIAS DO ESTADO DA BAHIA - FIEB', { uf: 'BA', sigla: 'FIEB' })?.orgao).toBe('FIEB')
    expect(empresaDaIndustria('SENAI - CIMATEC PARK', { uf: 'BA', sigla: 'FIEB' })?.orgao).toBe('SENAI-BA')
    expect(empresaDaIndustria('CONEF CONEF | CONEF', { uf: 'ES', sigla: 'FINDES' })).toBeNull()
    expect(empresaDaIndustria('', mg)).toBeNull()
  })

  it('lê o "/Date(ms)/" como relógio de Brasília, sem depender do fuso do processo', () => {
    expect(dataDoParadigmaEmBrasilia(dataLocal(2026, 10, 9, 12))?.toISOString()).toBe('2026-10-09T15:00:00.000Z')
    expect(dataDoParadigmaEmBrasilia('sem data')).toBeUndefined()
    expect(dataDoParadigmaEmBrasilia(null)).toBeUndefined()
  })

  it('as nove federações usam o endpoint do Mural, fonteId próprio e não colidem com o SESC', () => {
    expect(FEDERACOES_NO_PARADIGMA.map((f) => f.uf)).toEqual(['BA', 'CE', 'ES', 'MG', 'MS', 'MT', 'RJ', 'RS', 'SC'])
    for (const u of UNIDADES_DA_INDUSTRIA_NO_PARADIGMA) {
      expect(u.urls(AGORA)[0]).toMatch(/^https:\/\/[^/]+\/portal\/WebService\/Servicos\.asmx\/PesquisarProcessos#pagina=1$/)
      expect(u.sessaoUrl).toMatch(/\/portal\/Mural\.aspx$/)
      expect(u.proximasPaginas).toBeDefined()
    }
    for (const t of parse('RJ')) expect(t.fonteId).toMatch(/^IND-PDG-RJ-\d+$/)
  })

  it('conta os processos lidos, inclusive em resposta inválida', () => {
    expect(contarProcessosDoParadigma(lerSistemaS('paradigma-mt.json'))).toBe(6)
    expect(contarProcessosDoParadigma('<html>')).toBe(0)
  })
})
