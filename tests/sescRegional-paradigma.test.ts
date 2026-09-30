import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  criarUnidadeParadigma,
  dataParadigma,
  sescBA,
  sescDN,
  sescRJ,
  sescRS,
  sescSP,
} from '../src/services/sescRegional/paradigma'

// Recortes das respostas reais do PesquisarProcessos de cada portal (30/09/2026).
const ler = (nome: string) => readFileSync(join(__dirname, 'fixtures/sesc', nome), 'utf8')
const dn = ler('paradigma-dn.json')
const rj = ler('paradigma-rj.json')
const sp = ler('paradigma-sp.json')

const AGORA = new Date(2026, 8, 30, 12, 0)
const ctx = (url: string) => ({ url, agora: AGORA })

describe('dataParadigma', () => {
  it('lê o /Date(ms)/ como relógio local (o servidor manda local como UTC)', () => {
    // 1791547200000 = 2026-10-09T12:00:00Z -> 09/10/2026 12:00 local
    expect(dataParadigma('/Date(1791547200000)/')).toEqual(new Date(2026, 9, 9, 12, 0))
  })

  it('devolve undefined para valor ausente ou inválido', () => {
    expect(dataParadigma(undefined)).toBeUndefined()
    expect(dataParadigma('sem data')).toBeUndefined()
  })
})

describe('Paradigma — DN', () => {
  const r = sescDN.parse(dn, ctx(sescDN.urls(AGORA)[0]))
  const nums = r.map((t) => t.numeroControle)

  it('mantém só processos com prazo final de hoje em diante', () => {
    expect(nums).toContain('0100/26-PG') // termina em 09/10
    expect(nums).toContain('0116/26-PG') // termina hoje às 17h: ainda é atual
    expect(nums).toContain('0004/26-CC') // agendado para 16/10
    expect(nums).not.toContain('0001/26-CC') // prazo já passou (18/09)
    expect(nums).not.toContain('0026/26-PG') // processo antigo parado
  })

  it('distingue a modalidade pelo nome e tipo do portal', () => {
    const pg = r.find((t) => t.numeroControle === '0100/26-PG')!
    expect(pg.modalidade).toBe('PREGAO_ELETRONICO') // "Processo de contratação / Pregão"
    const cc = r.find((t) => t.numeroControle === '0004/26-CC')!
    expect(cc.modalidade).toBe('CONCORRENCIA') // "Processos presenciais / Concorrência"
  })

  it('usa chave própria no fonteId (o DN é RJ, como o Sesc RJ) e a UF correta', () => {
    const t = r.find((x) => x.numeroControle === '0100/26-PG')!
    expect(t.fonteId).toMatch(/^SESC-DN-\d+$/)
    expect(t.uf).toBe('RJ')
    expect(t.orgao).toBe('Sesc Departamento Nacional')
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.unidade).toMatch(/SESC/i)
    expect(t.linkEdital).toBe('https://egov-br.paradigmabs.com.br/sescdn/portal/Mural.aspx')
  })

  it('converte as datas de início e prazo final', () => {
    const t = r.find((x) => x.numeroControle === '0100/26-PG')!
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 30, 13, 0))
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 9, 12, 0))
    expect(t.encerramentoAt).toEqual(t.aberturaAt)
  })
})

describe('Paradigma — RJ (números mascarados, vários tipos)', () => {
  const r = sescRJ.parse(rj, ctx(sescRJ.urls(AGORA)[0]))

  it('não deixa caracteres de controle no número nem no objeto', () => {
    expect(r.length).toBeGreaterThan(0)
    for (const t of r) {
      // eslint-disable-next-line no-control-regex
      expect(`${t.numeroControle ?? ''}${t.objeto}`).not.toMatch(/[\u0000-\u001f]/)
    }
  })

  it('usa o número de exibição quando o edital vem mascarado', () => {
    const cot = r.find((t) => t.numeroControle === '0156-09/26')
    expect(cot).toBeDefined()
    expect(cot!.modalidade).toBe('OUTROS') // Cotação
  })

  it('descarta processo suspenso e processo antigo', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums.some((n) => n?.includes('5112'))).toBe(false) // Suspenso
    expect(nums.some((n) => n?.includes('2019'))).toBe(false) // de 2019
  })

  it('reconhece pregão eletrônico e dispensa', () => {
    const mods = r.map((t) => t.modalidade)
    expect(mods).toContain('PREGAO_ELETRONICO')
    expect(mods).toContain('DISPENSA_SEM_DISPUTA')
  })

  it('não colide com o DN: fonteId do RJ usa a UF como chave', () => {
    for (const t of r) expect(t.fonteId).toMatch(/^SESC-RJ-\d+$/)
  })
})

describe('Paradigma — SP (fases do pregão)', () => {
  const r = sescSP.parse(sp, ctx(sescSP.urls(AGORA)[0]))

  it('mantém o agendado e descarta negociação/habilitação e homologação', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toEqual(['PE 2026012000410'])
  })
})

describe('Paradigma — configuração das unidades', () => {
  it('as cinco unidades existem com base, sessão e POST corretos', () => {
    for (const u of [sescDN, sescSP, sescRJ, sescBA, sescRS]) {
      expect(u.urls(AGORA)[0]).toMatch(/\/portal\/WebService\/Servicos\.asmx\/PesquisarProcessos#pagina=1$/)
      expect(u.sessaoUrl).toMatch(/\/portal\/Mural\.aspx$/)
      expect(u.requisicaoPost).toBeDefined()
    }
  })

  it('o endpoint fica em /portal/ (na raiz da aplicação o IIS responde 403)', () => {
    expect(sescRJ.urls(AGORA)[0]).toBe(
      'https://egov.paradigmabs.com.br/SESCRJ/portal/WebService/Servicos.asmx/PesquisarProcessos#pagina=1'
    )
  })

  it('monta o corpo do POST com a visão "em andamento" e a faixa da página', () => {
    const corpo = (url: string) => JSON.parse(sescDN.requisicaoPost!(url).corpo).dtoProcesso
    const p1 = corpo(sescDN.urls(AGORA)[0])
    expect(p1.tmpTipoMuralVisao).toBe(999)
    expect(p1.dtoPaginacao).toEqual({ nPaginaDe: 1, nPaginaAte: 50 })
    expect(corpo(sescDN.urls(AGORA)[0].replace('#pagina=1', '#pagina=3')).dtoPaginacao).toEqual({
      nPaginaDe: 101,
      nPaginaAte: 150,
    })
  })

  it('só pede a próxima página se veio cheia e o último item é recente', () => {
    const item = (inicio: Date) => ({ nCdProcesso: 1, sDsObjeto: 'x', tDtInicial: `/Date(${Date.UTC(inicio.getFullYear(), inicio.getMonth(), inicio.getDate())})/` })
    const cheia = (inicio: Date) => JSON.stringify({ d: Array.from({ length: 50 }, () => item(inicio)) })
    const url = sescDN.urls(AGORA)[0]
    expect(sescDN.proximasPaginas!(cheia(new Date(2026, 8, 1)), ctx(url))).toEqual([url.replace('#pagina=1', '#pagina=2')])
    expect(sescDN.proximasPaginas!(cheia(new Date(2026, 0, 1)), ctx(url))).toEqual([]) // histórico
    expect(sescDN.proximasPaginas!(JSON.stringify({ d: [item(new Date(2026, 8, 1))] }), ctx(url))).toEqual([]) // página curta
  })

  it('falha com mensagem clara se a resposta não for JSON (ex.: 403 do IIS)', () => {
    expect(() => sescDN.parse('<html>403 - Forbidden</html>', ctx(sescDN.urls(AGORA)[0]))).toThrow(/não é JSON/)
  })

  it('ignora processos de outra entidade no portal compartilhado (Senac)', () => {
    const u = criarUnidadeParadigma({ uf: 'RS', nome: 'Sesc Rio Grande do Sul', base: 'https://x.test/app' })
    const futuro = `/Date(${Date.UTC(2026, 9, 20, 12)})/`
    const json = JSON.stringify({
      d: [
        { nCdProcesso: 1, sDsObjeto: 'do Senac', sNmEmpresa: 'SENAC - RS', tDtFinal: futuro, sDsSituacao: 'Em andamento' },
        { nCdProcesso: 2, sDsObjeto: 'do Sesc', sNmEmpresa: 'SESC - RS', tDtFinal: futuro, sDsSituacao: 'Em andamento' },
      ],
    })
    expect(u.parse(json, ctx('https://x.test/app')).map((t) => t.objeto)).toEqual(['do Sesc'])
  })
})
