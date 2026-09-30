import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescSC } from '../src/services/sescRegional/sc'

// Recorte do HTML real de www.sesc-sc.com.br/sobre-o-sesc/licitacoes (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/sc.html'), 'utf8')
const ctx = { url: 'https://www.sesc-sc.com.br/sobre-o-sesc/licitacoes', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescSC', () => {
  const r = sescSC.parse(html, ctx)

  it('mantém só as atuais e descarta as de sessão já realizada', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toContain('103/2026 (Localizado Licitações-e: 1101744)')
    expect(nums).toContain('068/2026 (Localizador Licitações-e: 1100308)') // sessão hoje
    expect(nums).not.toContain('081/2026 (Localizador Licitações-e: 1099716)')
    expect(nums).not.toContain('001/2025')
    expect(r).toHaveLength(4)
  })

  it('preenche identificação, fonte e UF', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('SESC-SC-16507')
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('SC')
      expect(t.orgao).toBe('Sesc Santa Catarina')
    }
  })

  it('extrai objeto, modalidade, datas e anexos absolutos', () => {
    const t = r.find((x) => x.fonteId === 'SESC-SC-16507')!
    expect(t.objeto).toBe('AQUISIÇÃO DE EQUIPAMENTOS DE INFORMÁTICA PARA UNIDADES DO SESC SC')
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 19, 14, 0))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 29))
    expect(t.linkEdital).toBe('https://www.sesc-sc.com.br/sescsc/conteudo/EDITAL_PE_103-26.pdf')
    const anexos = (t.rawJson as { anexos: { uri: string }[] }).anexos
    expect(anexos).toHaveLength(2)
    expect(anexos.every((a) => a.uri.startsWith('https://www.sesc-sc.com.br/'))).toBe(true)
    expect(t.valorEstimado).toBeUndefined()
  })

  it('reconhece concorrência', () => {
    const t = r.find((x) => x.numeroControle === '063/2026')!
    expect(t.modalidade).toBe('CONCORRENCIA')
  })
})
