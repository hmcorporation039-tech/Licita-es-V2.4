import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescRN } from '../src/services/sescRegional/rn'

// Recorte do HTML real de sescrn.com.br/pagina-licitacoes/ (páginas 1 e 2, 2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/rn.html'), 'utf8')
const ctx = { url: 'https://sescrn.com.br/pagina-licitacoes/', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescRN', () => {
  const r = sescRN.parse(html, ctx)

  it('mantém as com sessão a realizar e descarta encerradas e com data passada', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toEqual(['022/2026', '024/2026'])
    // PP 014 (Encerrado), PE 007 (13/08), CD 004 (17/08) e 24/00002-CS (2024) ficam de fora.
  })

  it('preenche fonte, UF, órgão, fonteId único e links absolutos', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of r) {
      expect(t.fonteId).toMatch(/^SESC-RN-pp-0\d\d-2026-/)
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('RN')
      expect(t.orgao).toBe('Sesc Rio Grande do Norte')
      expect(t.linkEdital).toMatch(/^https:\/\/sescrn\.com\.br\/licitacoes\//)
    }
  })

  it('extrai objeto, modalidade e data/hora de abertura', () => {
    const t = r.find((x) => x.numeroControle === '022/2026')!
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL')
    expect(t.objeto.startsWith('CONTRATAÇÃO DE EMPRESA ESPECIALIZADA')).toBe(true)
    expect(t.aberturaAt).toEqual(new Date(2026, 8, 30, 9, 0))
    const t2 = r.find((x) => x.numeroControle === '024/2026')!
    expect(t2.aberturaAt).toEqual(new Date(2026, 9, 6, 9, 0))
  })

  it('volta a incluir a sessão republicada se o relógio recuar', () => {
    const recuado = sescRN.parse(html, { ...ctx, agora: new Date(2026, 7, 10) })
    const nums = recuado.map((t) => t.numeroControle)
    expect(nums).toContain('007/2026')
    expect(recuado.find((t) => t.numeroControle === '007/2026')!.modalidade).toBe('PREGAO_ELETRONICO')
    expect(nums).not.toContain('014/2026') // encerrado em qualquer data
  })

  it('segue só a página 2 a partir da primeira', () => {
    expect(sescRN.proximasPaginas!(html, ctx)).toEqual(['https://sescrn.com.br/pagina-licitacoes/page/2/'])
    expect(
      sescRN.proximasPaginas!(html, { ...ctx, url: 'https://sescrn.com.br/pagina-licitacoes/page/2/' })
    ).toEqual([])
  })
})
