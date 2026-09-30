import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { sescSE } from '../src/services/sescRegional/se'

const html = readFileSync('tests/fixtures/sesc/se.html', 'utf8')
const url = 'https://sesc-se.com.br/licitacoes/?situacao=aberto'
const ctx = { url, agora: new Date(2026, 8, 30, 10, 0) }

describe('sescSE.parse', () => {
  const r = sescSE.parse(html, ctx)

  it('mantém só a atual; descarta "Aberto" vencida e finalizada', () => {
    expect(r).toHaveLength(1)
    expect(r[0].numeroControle).toBe('26/0001')
  })
  it('campos', () => {
    const t = r[0]
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.fonteId).toBe('SESC-SE-26-0001-cc')
    expect(t.uf).toBe('SE')
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 16))
    expect(t.linkEdital).toBe('https://sesc-se.com.br/licitacoes/26-0001-cc/')
    expect(t.objeto).toContain('REFORMA E AMPLIAÇÃO')
  })
  it('só histórico antigo devolve []', () => {
    expect(sescSE.parse(html, { url, agora: new Date(2027, 0, 1) })).toEqual([])
  })
  it('paginação: segue enquanto há atual', () => {
    expect(sescSE.proximasPaginas?.(html, ctx)).toEqual(['https://sesc-se.com.br/licitacoes/page/2/'])
    expect(sescSE.proximasPaginas?.(html, { url, agora: new Date(2027, 0, 1) })).toEqual([])
  })
})
