import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { sescPA } from '../src/services/sescRegional/pa'

// Recorte do HTML real de www.sesc-pa.com.br/licitacao (2026-09-30).
const html = readFileSync(join(__dirname, 'fixtures/sesc/pa.html'), 'utf8')
const ctx = {
  url: 'https://www.sesc-pa.com.br/licitacao?view=table&pageSize=12',
  agora: new Date(2026, 8, 22, 10, 0),
}

describe('sescPA', () => {
  const r = sescPA.parse(html, ctx)

  it('mantém só as em andamento com sessão hoje/futura', () => {
    const nums = r.map((t) => t.numeroControle)
    expect(nums).toEqual(['26/0019', '26/0020']) // 26/0020: sessão hoje
    expect(nums).not.toContain('26/0005') // andamento, mas sessão passada
    expect(nums).not.toContain('25/0032') // suspenso
    expect(nums).not.toContain('26/0002') // finalizado
  })

  it('preenche identificação, fonte, UF, modalidade e datas', () => {
    const ids = r.map((t) => t.fonteId)
    expect(new Set(ids).size).toBe(ids.length)
    expect(ids).toContain('SESC-PA-26-0019')
    for (const t of r) {
      expect(t.fonte).toBe('SESC_REGIONAL')
      expect(t.uf).toBe('PA')
      expect(t.orgao).toBe('Sesc Pará')
      expect(t.modalidade).toBe('PREGAO_ELETRONICO')
    }
    expect(r[0].aberturaAt).toEqual(new Date(2026, 8, 25))
    expect(r[0].objeto).toMatch(/mureta com gradil/)
  })

  it('resolve o link de detalhe para URL absoluta', () => {
    expect(r[0].linkEdital).toBe('https://www.sesc-pa.com.br/licitacao/pregao-eletronico/26-0019')
  })

  it('segue a paginação numerada sem repetir a página atual', () => {
    const p = sescPA.proximasPaginas!(html, ctx)
    expect(p).toContain('https://www.sesc-pa.com.br/licitacao?view=table&pageSize=12&page=2')
    expect(p).not.toContain('https://www.sesc-pa.com.br/licitacao?view=table&pageSize=12&page=1')
    expect(new Set(p).size).toBe(p.length)
  })
})
