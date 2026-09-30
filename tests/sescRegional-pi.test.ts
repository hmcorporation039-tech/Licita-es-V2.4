import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescPI } from '../src/services/sescRegional/pi'

// Recorte do HTML real de www.sescpiaui.com.br/licitao-2026/ (2026-09-30): 4 painéis
// (26/000001 Deserta, 26/000003 Cancelada, 26/000020 e 26/000021 "Em andamento").
const html = readFileSync(join(__dirname, 'fixtures/sesc/pi.html'), 'utf8')
const url = 'http://www.sescpiaui.com.br/licitao-2026/'
const ctx = { url, agora: new Date(2026, 7, 10, 10, 0) }

// Recorte do índice real http://www.sescpiaui.com.br/licitacao/ (só botões por ano).
const box = (ano: string, href: string) =>
  `<div class="circle-icon-box"><a href="${href}" class="link-icon"></a><a href="${href}" class="link-title"><h4> Licitações ${ano}</h4></a><a href="${href}" class="more-button">Ver Licitações..</a></div>`
const indice = `<html><body>${box('2026', 'http://www.sescpiaui.com.br/licitao-2026/')}${box('2025', 'https://www.sescpiaui.com.br/licitacao-2-25/')}${box('2024', 'http://www.sescpiaui.com.br/licitacao-2-24')}</body></html>`

describe('sescPI', () => {
  const r = sescPI.parse(html, ctx)

  it('mantém só as abertas/com sessão a realizar', () => {
    expect(r.map((t) => t.numeroControle)).toEqual(['26/000020-CC', '26/000021-CC'])
  })

  it('descarta Deserta e Cancelada, e passada a sessão descarta também as em andamento', () => {
    expect(r.map((t) => t.numeroControle)).not.toContain('26/000001-CC')
    expect(r.map((t) => t.numeroControle)).not.toContain('26/000003-CC')
    const tarde = sescPI.parse(html, { ...ctx, agora: new Date(2026, 8, 30) })
    expect(tarde).toHaveLength(0)
  })

  it('preenche fonte, UF, órgão, fonteId único e link absoluto', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toEqual(['SESC-PI-26-000020-CC', 'SESC-PI-26-000021-CC'])
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('PI')
      expect(t.orgao).toBe('Sesc Piauí')
      expect(t.linkEdital).toMatch(/^http:\/\/www\.sescpiaui\.com\.br\/licitao-2026\/#edital-de-concorrencia-/)
    }
  })

  it('extrai objeto, modalidade e data/hora da sessão', () => {
    const t = r.find((x) => x.numeroControle === '26/000021-CC')!
    expect(t.modalidade).toBe('CONCORRENCIA')
    expect(t.objeto).toContain('veículo tipo ônibus')
    expect(t.aberturaAt).toEqual(new Date(2026, 8, 3, 9, 30))
  })

  it('descobre, no índice, só a página do ano corrente', () => {
    expect(sescPI.urls(ctx.agora)).toEqual(['https://www.sescpiaui.com.br/licitacao/'])
    expect(sescPI.proximasPaginas!(indice, { ...ctx, url: 'https://www.sescpiaui.com.br/licitacao/' })).toEqual([
      'https://www.sescpiaui.com.br/licitao-2026/', // links do índice são promovidos a https
    ])
    // em janeiro/fevereiro inclui também o ano anterior
    expect(
      sescPI.proximasPaginas!(indice, { url: 'https://www.sescpiaui.com.br/licitacao/', agora: new Date(2026, 1, 10) })
    ).toHaveLength(2)
    // nas páginas de ano não segue nada
    expect(sescPI.proximasPaginas!(html, ctx)).toEqual([])
  })
})
