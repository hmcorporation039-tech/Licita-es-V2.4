import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescTO } from '../src/services/sescRegional/to'

// Recorte do HTML real de www.sescto.com.br/licitacao (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/to.html'), 'utf8')
const ctx = { url: 'https://www.sescto.com.br/licitacao', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescTO', () => {
  const r = sescTO.parse(html, ctx)

  it('mantém só as "Aberto", descartando julgamento e concluídas', () => {
    expect(r.map((t) => t.numeroControle)).toEqual(['00/00.06-PG', '00/00.04-PG'])
  })

  it('preenche fonte, UF, órgão, fonteId estável e único, link absoluto', () => {
    expect(r.map((t) => t.fonteId)).toEqual(['SESC-TO-4345', 'SESC-TO-4344'])
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('TO')
      expect(t.orgao).toBe('Sesc Tocantins')
      expect(t.linkEdital).toMatch(/^https:\/\/www\.sescto\.com\.br\/datelhes-licitacao\?id=\d+$/)
    }
  })

  it('extrai objeto, modalidade e datas', () => {
    const t = r[1]
    expect(t.modalidade).toBe('PREGAO_PRESENCIAL')
    expect(t.objeto).toContain('carnes bovinas')
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 18))
    expect(t.aberturaAt).toEqual(new Date(2026, 8, 29, 9, 0))
  })

  it('descarta "Aberto" publicado há mais de 60 dias', () => {
    expect(sescTO.parse(html, { ...ctx, agora: new Date(2026, 11, 31) })).toHaveLength(0)
  })
})
