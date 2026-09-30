import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescRO } from '../src/services/sescRegional/ro'

// Recorte do HTML real de sescro.com.br/licitacoes/{pregao-eletronico,credenciamento,convite,...} (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/ro.html'), 'utf8')
const ctx = { url: 'https://sescro.com.br/licitacoes/pregao-eletronico/', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescRO', () => {
  const r = sescRO.parse(html, ctx)

  it('mantém só as abertas e recentes', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toEqual(['0023/26-PGE', '0032/26-PGE', '0003/26-SEALI'])
    expect(nums).not.toContain('0030/26-PGE') // Concluído
    expect(nums).not.toContain('0001/25-CV') // Aberto porém antigo, com relatório de encerramento
    expect(nums).not.toContain('0023/25-PG') // Aberto porém publicado há mais de 60 dias
    expect(nums).not.toContain('0004/2025-SEALI') // credenciamento com mais de 1 ano
  })

  it('preenche fonte, UF, órgão e fonteId estável e único', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(sescRO.parse(html, ctx).map((t) => t.fonteId)).toEqual(ids)
    for (const t of r) {
      expect(t.fonteId).toMatch(/^SESC-RO-/)
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('RO')
      expect(t.orgao).toBe('Sesc Rondônia')
      expect(t.linkEdital).toMatch(/^https:\/\//)
    }
  })

  it('extrai objeto, modalidade, publicação e anexos', () => {
    const pe = r.find((t) => t.numeroControle === '0023/26-PGE')!
    expect(pe.modalidade).toBe('PREGAO_ELETRONICO')
    expect(pe.objeto).toContain('FORNECIMENTO PARCELADO DE GÊNEROS ALIMENTÍCIOS')
    expect(pe.publicadoAt).toEqual(new Date(2026, 8, 28))
    expect(pe.linkEdital).toContain('IgBUTjip')
    expect((pe.rawJson as { anexos: unknown[] }).anexos).toHaveLength(2)
    const cred = r.find((t) => t.numeroControle === '0003/26-SEALI')!
    expect(cred.modalidade).toBe('CREDENCIAMENTO')
    expect(cred.publicadoAt).toEqual(new Date(2026, 8, 2))
  })

  it('aponta para as páginas do ano corrente', () => {
    const u = sescRO.urls(new Date(2026, 8, 30))
    expect(u[0]).toBe('https://sescro.com.br/licitacoes/editais-pregao-presencial/2026-2/')
    expect(u).toHaveLength(5)
    expect(sescRO.urls(new Date(2026, 0, 15))).toHaveLength(6)
  })
})
