import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescPE } from '../src/services/sescRegional/pe'

// Recorte (mesmas colunas e registros reais) da planilha pública do Google Sheets que
// alimenta licitacoes.sescpe.com.br, exportada em CSV (2026-09-30), + 1 linha vazia.
const csv = readFileSync(join(__dirname, 'fixtures/sesc/pe.csv'), 'utf8')
const ctx = { url: sescPE.urls(new Date())[0], agora: new Date(2026, 7, 15, 10, 0) }

describe('sescPE', () => {
  const r = sescPE.parse(csv, ctx)

  it('mantém só as abertas com sessão a realizar', () => {
    expect(r.map((t) => t.fonteId)).toEqual([
      'SESC-PE-concorrencia-publica-002-2026',
      'SESC-PE-leilao-alienacao-de-bens-002-2026',
      'SESC-PE-pregao-eletronico-091-2026',
    ])
  })

  it('descarta finalizada, cancelada, sessão já passada e linhas vazias', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).not.toContain('003/2026') // Finalizado
    expect(nums).not.toContain('067/2026') // Cancelado
    expect(r.find((t) => t.modalidade === 'PREGAO_ELETRONICO' && t.numeroControle === '001/2026')).toBeUndefined() // sessão 11/02
    const fim = sescPE.parse(csv, { ...ctx, agora: new Date(2026, 8, 30) })
    expect(fim.map((t) => t.numeroControle)).toEqual(['091/2026'])
  })

  it('fonteId único mesmo com o mesmo nº em modalidades diferentes (002/2026)', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('PE')
      expect(t.orgao).toBe('Sesc Pernambuco')
      expect(t.linkEdital).toMatch(/^https:\/\/drive\.google\.com\/drive\/folders\//)
    }
  })

  it('extrai modalidade, datas e objeto (inclusive campo multilinha entre aspas)', () => {
    const cc = r.find((t) => t.numeroControle === '002/2026' && t.modalidade === 'CONCORRENCIA')!
    expect(cc.aberturaAt).toEqual(new Date(2026, 7, 20))
    const pe = r.find((t) => t.numeroControle === '091/2026')!
    expect(pe.modalidade).toBe('PREGAO_ELETRONICO')
    expect(pe.aberturaAt).toEqual(new Date(2026, 9, 6))
    expect(pe.objeto).toContain('FREEZER')
    expect(pe.objeto).not.toContain('\n')
    expect(r.find((t) => t.modalidade === 'OUTROS')!.objeto).toMatch(/^ALIEN/)
  })

  it('devolve vazio para conteúdo inesperado', () => {
    expect(sescPE.parse('<html>Carregando portal de licitações...</html>', ctx)).toEqual([])
  })
})
