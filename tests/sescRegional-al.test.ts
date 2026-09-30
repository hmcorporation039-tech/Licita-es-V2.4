import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescAL } from '../src/services/sescRegional/al'

// Recorte do HTML real de sescalagoas.com.br/licitacoes/abertas (1 item aberto) mais
// 2 itens de /licitacoes/andamento (mesmo markup, sessão já realizada), capturado em 2026-09-30.
const html = readFileSync(join(__dirname, 'fixtures/sesc/al.html'), 'utf8')
const ctx = { url: 'https://www.sescalagoas.com.br/licitacoes/abertas', agora: new Date(2026, 8, 30, 10, 0) }

describe('sescAL', () => {
  const r = sescAL.parse(html, ctx)

  it('mantém a aberta e descarta as de sessão já realizada', () => {
    expect(r).toHaveLength(1)
    expect(r[0].numeroControle).toBe('AL026/2026')
  })

  it('preenche identificação, fonte, UF e links absolutos', () => {
    const t = r[0]
    expect(t.fonteId).toBe('SESC-AL-AL026-2026')
    expect(t.fonte).toBe('SESC_REGIONAL')
    expect(t.uf).toBe('AL')
    expect(t.orgao).toBe('Sesc Alagoas')
    expect(t.linkEdital).toMatch(/^https:\/\/www\.sescalagoas\.com\.br\/licitacoes\/l\/pregao-eletronico-n-al026-2026/)
  })

  it('extrai objeto, modalidade e datas', () => {
    const t = r[0]
    expect(t.objeto).toMatch(/^Registro de Preços para a Aquisição e instalação de câmaras frigorificas/)
    expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    expect(t.aberturaAt).toEqual(new Date(2026, 9, 2))
    expect(t.publicadoAt).toEqual(new Date(2026, 8, 14))
  })

  it('devolve [] quando não há itens', () => {
    expect(sescAL.parse('<div id="bidding"><div class="pagination-objects"></div></div>', ctx)).toEqual([])
  })
})
